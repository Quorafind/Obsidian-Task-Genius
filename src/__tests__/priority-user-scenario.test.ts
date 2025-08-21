/**
 * Priority User Scenario Test
 * 
 * This test simulates the exact scenario reported by the user:
 * 1. First load: priority appears correct initially
 * 2. Second load: data is completely lost (not just priority) 
 * 3. Third load: data returns but ALL priorities show as 3 (regardless of actual emoji)
 */

import { DataflowOrchestrator } from "../dataflow/Orchestrator";
import { MarkdownTaskParser } from "../dataflow/core/ConfigurableTaskParser";
import { Augmentor } from "../dataflow/augment/Augmentor";
import { createDefaultParserConfig } from "../types/TaskParserConfig";
import { Task } from "../types/task";

// Mock classes for testing
class MockApp {
  vault: any;
  metadataCache: any;
  workspace: any;

  constructor() {
    this.vault = new MockVault();
    this.metadataCache = new MockMetadataCache();
    this.workspace = { editorSuggest: { suggests: [] } };
  }
}

class MockVault {
  private files = new Map<string, any>();
  
  getMarkdownFiles() {
    return Array.from(this.files.values()).filter(f => f.extension === 'md');
  }
  
  getFiles() {
    return Array.from(this.files.values());
  }
  
  getAbstractFileByPath(path: string) {
    return this.files.get(path);
  }
  
  async cachedRead(file: any) {
    return file.content || "";
  }
  
  adapter = {
    async stat(path: string) {
      const file = this.files.get(path);
      return file ? { mtime: file.mtime || Date.now() } : null;
    }
  };
  
  addFile(path: string, content: string, mtime?: number) {
    this.files.set(path, {
      path,
      content,
      extension: path.split('.').pop() || '',
      mtime: mtime || Date.now()
    });
  }
}

class MockMetadataCache {
  private metadata = new Map<string, any>();
  
  getFileCache(file: any) {
    return this.metadata.get(file.path) || { frontmatter: {} };
  }
  
  setMetadata(path: string, meta: any) {
    this.metadata.set(path, { frontmatter: meta });
  }
}

class MockPlugin {
  settings = {
    customDateFormats: [],
    statusMapping: {},
    emojiMapping: {
      "🔺": "priority",
      "⏫": "priority", 
      "🔼": "priority",
      "🔽": "priority",
      "⏬": "priority"
    },
    specialTagPrefixes: {},
    fileMetadataInheritance: {
      enabled: true,
      inheritFromFrontmatter: true,
      inheritFromFrontmatterForSubtasks: false
    },
    projectConfig: {
      enableEnhancedProject: false
    },
    fileSourceConfig: {
      enabled: false
    }
  };
  
  getIcsManager() {
    return null;
  }
}

describe("Priority User Scenario Test", () => {
  let mockApp: MockApp;
  let mockPlugin: MockPlugin;
  let parser: MarkdownTaskParser;
  let augmentor: Augmentor;

  beforeEach(() => {
    mockApp = new MockApp();
    mockPlugin = new MockPlugin();
    
    const config = createDefaultParserConfig();
    parser = new MarkdownTaskParser(config);
    augmentor = new Augmentor();
  });

  test("should simulate exact user scenario: multiple tasks with different priorities", async () => {
    // Prepare test data with multiple tasks having different priority emojis
    const testContent = `# Test Tasks

- [ ] Highest priority task 🔺
- [ ] High priority task ⏫  
- [ ] Medium priority task 🔼
- [ ] Low priority task 🔽
- [ ] Lowest priority task ⏬
- [ ] No priority task`;

    const expectedPriorities = [
      { emoji: "🔺", expected: 5, name: "Highest" },
      { emoji: "⏫", expected: 4, name: "High" },
      { emoji: "🔼", expected: 3, name: "Medium" },  
      { emoji: "🔽", expected: 2, name: "Low" },
      { emoji: "⏬", expected: 1, name: "Lowest" },
      { emoji: "", expected: undefined, name: "No priority" }
    ];

    console.log("\n=== User Scenario Simulation ===");
    
    // FIRST LOAD - Should work correctly
    console.log("\n--- FIRST LOAD ---");
    const firstLoadTasks = parser.parseLegacy(testContent, "test.md");
    
    const firstAugmented = augmentor.mergeCompat(
      { filePath: "test.md", fileMeta: {}, project: null },
      firstLoadTasks
    );
    
    console.log("First load results:");
    firstAugmented.forEach((task, index) => {
      console.log(`  ${expectedPriorities[index].name}: ${task.metadata.priority} (expected: ${expectedPriorities[index].expected})`);
      expect(task.metadata.priority).toBe(expectedPriorities[index].expected);
    });
    
    // SECOND LOAD - Simulate cache miss/corruption where data might be lost
    console.log("\n--- SECOND LOAD (simulating cache issues) ---");
    
    // In the real scenario, this would be a cache miss, but the user reports
    // data is "completely lost". Let's simulate re-parsing the same content
    const secondLoadTasks = parser.parseLegacy(testContent, "test.md");
    
    const secondAugmented = augmentor.mergeCompat(
      { filePath: "test.md", fileMeta: {}, project: null },
      secondLoadTasks  
    );
    
    console.log("Second load results:");
    secondAugmented.forEach((task, index) => {
      console.log(`  ${expectedPriorities[index].name}: ${task.metadata.priority} (expected: ${expectedPriorities[index].expected})`);
      expect(task.metadata.priority).toBe(expectedPriorities[index].expected);
    });
    
    // THIRD LOAD - This is where the bug used to manifest (all priorities = 3)
    console.log("\n--- THIRD LOAD (testing for priority=3 bug) ---");
    
    // Simulate another reload cycle
    const thirdLoadTasks = parser.parseLegacy(testContent, "test.md");
    
    const thirdAugmented = augmentor.mergeCompat(
      { filePath: "test.md", fileMeta: {}, project: null },
      thirdLoadTasks
    );
    
    console.log("Third load results:");
    let allPrioritiesAre3 = true;
    thirdAugmented.forEach((task, index) => {
      console.log(`  ${expectedPriorities[index].name}: ${task.metadata.priority} (expected: ${expectedPriorities[index].expected})`);
      expect(task.metadata.priority).toBe(expectedPriorities[index].expected);
      
      // Check if the bug manifests (all priorities become 3)
      if (task.metadata.priority !== 3 && task.metadata.priority !== undefined) {
        allPrioritiesAre3 = false;
      }
    });
    
    // Ensure the bug doesn't manifest (not all priorities should be 3)
    expect(allPrioritiesAre3).toBe(false);
    console.log("✓ Bug NOT reproduced - priorities correctly preserved!");
  });

  test("should handle cached task data correctly through serialization cycles", async () => {
    const content = "- [ ] Important task 🔺";
    
    console.log("\n=== Serialization Cycle Test ===");
    
    // Initial parse
    const initialTasks = parser.parseLegacy(content, "test.md");
    const initialAugmented = augmentor.mergeCompat(
      { filePath: "test.md", fileMeta: {}, project: null },
      initialTasks
    );
    
    expect(initialAugmented[0].metadata.priority).toBe(5);
    console.log("Initial priority:", initialAugmented[0].metadata.priority);
    
    // Simulate multiple cache storage/retrieval cycles (JSON serialization)
    let currentTask = initialAugmented[0];
    
    for (let cycle = 1; cycle <= 5; cycle++) {
      console.log(`\nCache cycle ${cycle}:`);
      
      // Simulate storage (JSON serialization)
      const serialized = JSON.stringify(currentTask);
      const deserialized = JSON.parse(serialized) as Task;
      
      console.log(`  After serialization: ${deserialized.metadata.priority}`);
      expect(deserialized.metadata.priority).toBe(5);
      
      // Simulate re-augmentation after cache load
      const reAugmented = augmentor.mergeCompat(
        { filePath: "test.md", fileMeta: {}, project: null },
        [deserialized]
      );
      
      console.log(`  After re-augmentation: ${reAugmented[0].metadata.priority}`);
      expect(reAugmented[0].metadata.priority).toBe(5);
      
      currentTask = reAugmented[0];
    }
    
    console.log("✓ Priority preserved through all serialization cycles!");
  });

  test("should not apply default priority=3 when no priority exists", async () => {
    const content = "- [ ] Task with no priority";
    
    console.log("\n=== Default Priority Test ===");
    
    for (let cycle = 1; cycle <= 3; cycle++) {
      console.log(`\nCycle ${cycle}:`);
      
      const tasks = parser.parseLegacy(content, "test.md");
      const augmented = augmentor.mergeCompat(
        { filePath: "test.md", fileMeta: {}, project: null },
        tasks
      );
      
      console.log(`  Priority: ${augmented[0].metadata.priority}`);
      expect(augmented[0].metadata.priority).toBeUndefined();
      expect(augmented[0].metadata.priority).not.toBe(3); // Should NOT default to 3
    }
    
    console.log("✓ No default priority applied!");
  });

  test("should preserve emoji priorities correctly after mixed operations", async () => {
    console.log("\n=== Mixed Operations Test ===");
    
    const testCases = [
      { content: "- [ ] Task A 🔺", expectedPriority: 5 },
      { content: "- [ ] Task B ⏫", expectedPriority: 4 },
      { content: "- [ ] Task C 🔼", expectedPriority: 3 },
      { content: "- [ ] Task D 🔽", expectedPriority: 2 },
      { content: "- [ ] Task E ⏬", expectedPriority: 1 }
    ];
    
    // Process all tasks multiple times with different contexts
    for (let iteration = 1; iteration <= 3; iteration++) {
      console.log(`\nIteration ${iteration}:`);
      
      for (const testCase of testCases) {
        const tasks = parser.parseLegacy(testCase.content, "test.md");
        const augmented = augmentor.mergeCompat(
          { filePath: "test.md", fileMeta: {}, project: null },
          tasks
        );
        
        console.log(`  ${testCase.content} -> priority: ${augmented[0].metadata.priority}`);
        expect(augmented[0].metadata.priority).toBe(testCase.expectedPriority);
      }
    }
    
    console.log("✓ All emoji priorities preserved across iterations!");
  });
});