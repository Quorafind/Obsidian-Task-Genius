/**
 * Edge case tests for the tree view fix
 * Tests various boundary conditions to ensure robustness
 */

// Test the fixed logic with various edge cases
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

// Edge Case 1: Empty task list
console.log("=== Edge Case 1: Empty Task List ===");
const emptyTasks = [];
const emptyMap = new Map();
const result1 = testTreeViewLogic(emptyTasks, emptyMap);
console.log("Result:", result1);
console.log("Expected: Empty array");
console.log("Test:", result1.length === 0 ? "PASS" : "FAIL");

// Edge Case 2: Only child tasks (parent not in section)
console.log("\n=== Edge Case 2: Only Child Tasks ===");
const childOnlyTasks = [
    {
        id: "child-1",
        content: "Child 1",
        metadata: { parent: "external-parent", children: [], project: "test" },
        line: 1
    },
    {
        id: "child-2", 
        content: "Child 2",
        metadata: { parent: "external-parent", children: [], project: "test" },
        line: 2
    }
];
const childOnlyMap = new Map();
childOnlyTasks.forEach(task => childOnlyMap.set(task.id, task));
// Add external parent to map
childOnlyMap.set("external-parent", {
    id: "external-parent",
    content: "External Parent",
    metadata: { parent: null, children: ["child-1", "child-2"], project: "other" },
    line: 0
});

const result2 = testTreeViewLogic(childOnlyTasks, childOnlyMap);
console.log("Result:", result2.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: External parent should be root");
console.log("Test:", result2.length === 1 && result2[0].id === "external-parent" ? "PASS" : "FAIL");

// Edge Case 3: Only parent tasks (no children in section)
console.log("\n=== Edge Case 3: Only Parent Tasks ===");
const parentOnlyTasks = [
    {
        id: "parent-1",
        content: "Parent 1",
        metadata: { parent: null, children: ["external-child-1"], project: "test" },
        line: 1
    },
    {
        id: "parent-2",
        content: "Parent 2", 
        metadata: { parent: null, children: ["external-child-2"], project: "test" },
        line: 2
    }
];
const parentOnlyMap = new Map();
parentOnlyTasks.forEach(task => parentOnlyMap.set(task.id, task));

const result3 = testTreeViewLogic(parentOnlyTasks, parentOnlyMap);
console.log("Result:", result3.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: Both parents should be roots");
console.log("Test:", result3.length === 2 ? "PASS" : "FAIL");

// Edge Case 4: Cross-project hierarchy
console.log("\n=== Edge Case 4: Cross-Project Hierarchy ===");
const crossProjectTasks = [
    {
        id: "project-a-child",
        content: "Project A Child",
        metadata: { parent: "project-b-parent", children: [], project: "project-a" },
        line: 2
    }
];
const crossProjectMap = new Map();
crossProjectTasks.forEach(task => crossProjectMap.set(task.id, task));
crossProjectMap.set("project-b-parent", {
    id: "project-b-parent",
    content: "Project B Parent",
    metadata: { parent: null, children: ["project-a-child"], project: "project-b" },
    line: 1
});

const result4 = testTreeViewLogic(crossProjectTasks, crossProjectMap);
console.log("Result:", result4.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: Should find project-b-parent as root");
console.log("Test:", result4.length === 1 && result4[0].id === "project-b-parent" ? "PASS" : "FAIL");

// Edge Case 5: Circular reference protection
console.log("\n=== Edge Case 5: Missing Parent Task ===");
const missingParentTasks = [
    {
        id: "orphan-child",
        content: "Orphan Child",
        metadata: { parent: "non-existent-parent", children: [], project: "test" },
        line: 1
    }
];
const missingParentMap = new Map();
missingParentTasks.forEach(task => missingParentMap.set(task.id, task));

const result5 = testTreeViewLogic(missingParentTasks, missingParentMap);
console.log("Result:", result5.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: Should treat orphan as root task");
console.log("Test:", result5.length === 1 && result5[0].id === "orphan-child" ? "PASS" : "FAIL");

// Edge Case 6: Deep nesting
console.log("\n=== Edge Case 6: Deep Nesting ===");
const deepTasks = [
    {
        id: "level-3",
        content: "Level 3",
        metadata: { parent: "level-2", children: [], project: "test" },
        line: 3
    },
    {
        id: "level-2", 
        content: "Level 2",
        metadata: { parent: "level-1", children: ["level-3"], project: "test" },
        line: 2
    },
    {
        id: "level-1",
        content: "Level 1",
        metadata: { parent: null, children: ["level-2"], project: "test" },
        line: 1
    }
];
const deepMap = new Map();
deepTasks.forEach(task => deepMap.set(task.id, task));

const result6 = testTreeViewLogic(deepTasks, deepMap);
console.log("Result:", result6.map(t => ({ id: t.id, content: t.content })));
console.log("Expected: Only level-1 should be root");
console.log("Test:", result6.length === 1 && result6[0].id === "level-1" ? "PASS" : "FAIL");

console.log("\n=== Summary ===");
const allTests = [result1.length === 0, 
                 result2.length === 1 && result2[0].id === "external-parent",
                 result3.length === 2,
                 result4.length === 1 && result4[0].id === "project-b-parent", 
                 result5.length === 1 && result5[0].id === "orphan-child",
                 result6.length === 1 && result6[0].id === "level-1"];
const passCount = allTests.filter(Boolean).length;
console.log(`${passCount}/6 tests passed`);
console.log(passCount === 6 ? "✅ All edge case tests PASS" : "❌ Some edge case tests FAIL");
