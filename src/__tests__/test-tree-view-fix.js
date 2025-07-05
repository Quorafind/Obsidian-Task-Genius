/**
 * Test script to verify the tree view fix
 * This simulates the scenario described in the issue
 */

// Mock task data that simulates the problem scenario
const mockTasks = [
    {
        id: "parent-task",
        content: "测试🔽",
        metadata: {
            parent: null,
            children: ["child-1", "child-2", "child-3", "child-4"],
            project: "myproject-2"
        },
        line: 14
    },
    {
        id: "child-1",
        content: "子任务1",
        metadata: {
            parent: "parent-task",
            children: [],
            project: "myproject-2"
        },
        line: 15
    },
    {
        id: "child-2",
        content: "子任务2",
        metadata: {
            parent: "parent-task",
            children: [],
            project: "myproject-2"
        },
        line: 16
    },
    {
        id: "child-3",
        content: "子任务3",
        metadata: {
            parent: "parent-task",
            children: [],
            project: "myproject-2"
        },
        line: 17
    },
    {
        id: "child-4",
        content: "子任务4",
        metadata: {
            parent: "parent-task",
            children: [],
            project: "myproject-2"
        },
        line: 18
    }
];

// Simulate the fixed logic
function testTreeViewLogic(sectionTasks, allTasksMap) {
    const sectionTaskIds = new Set(sectionTasks.map(t => t.id));
    
    // Helper function to mark subtree as processed
    const markSubtreeAsProcessed = (rootTask, sectionTaskIds, processedTaskIds) => {
        if (sectionTaskIds.has(rootTask.id)) {
            processedTaskIds.add(rootTask.id);
        }
        
        if (rootTask.metadata.children) {
            rootTask.metadata.children.forEach(childId => {
                const childTask = allTasksMap.get(childId);
                if (childTask) {
                    markSubtreeAsProcessed(childTask, sectionTaskIds, processedTaskIds);
                }
            });
        }
    };
    
    // Identify true root tasks to avoid duplicate rendering
    const rootTasksToRender = [];
    const processedTaskIds = new Set();
    
    for (const task of sectionTasks) {
        // Skip already processed tasks
        if (processedTaskIds.has(task.id)) {
            continue;
        }
        
        // Check if this is a root task (no parent or parent not in current section)
        if (!task.metadata.parent || !sectionTaskIds.has(task.metadata.parent)) {
            // This is a root task
            let actualRoot = task;
            
            // If has parent but parent not in current section, find the complete root
            if (task.metadata.parent) {
                let currentTask = task;
                while (currentTask.metadata.parent && !sectionTaskIds.has(currentTask.metadata.parent)) {
                    const parentTask = allTasksMap.get(currentTask.metadata.parent);
                    if (!parentTask) {
                        console.warn(`Parent task ${currentTask.metadata.parent} not found in allTasksMap.`);
                        break;
                    }
                    actualRoot = parentTask;
                    currentTask = parentTask;
                }
            }
            
            // Add root task to render list if not already added
            if (!rootTasksToRender.some(t => t.id === actualRoot.id)) {
                rootTasksToRender.push(actualRoot);
            }
            
            // Mark entire subtree as processed to avoid duplicate rendering
            markSubtreeAsProcessed(actualRoot, sectionTaskIds, processedTaskIds);
        }
    }
    
    return rootTasksToRender;
}

// Run the test
console.log("Testing tree view fix...");

const allTasksMap = new Map();
mockTasks.forEach(task => allTasksMap.set(task.id, task));

const rootTasks = testTreeViewLogic(mockTasks, allTasksMap);

console.log("Root tasks to render:", rootTasks.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: Only 1 root task (parent-task)");
console.log("Actual count:", rootTasks.length);
console.log("Test result:", rootTasks.length === 1 && rootTasks[0].id === "parent-task" ? "PASS" : "FAIL");

if (rootTasks.length === 1 && rootTasks[0].id === "parent-task") {
    console.log("✅ Fix is working correctly - no duplicate tasks!");
} else {
    console.log("❌ Fix is not working - tasks are still duplicated");
}
