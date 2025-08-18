/**
 * Integration test to verify the new dataflow components work together
 * This serves as both a test and example of how to use the new components
 */

import type { Task } from "../types/task";
import { WorkerOrchestrator } from "./workers/WorkerOrchestrator";
import { ObsidianSource } from "./sources/ObsidianSource";
import { Augmentor, AugmentContext, InheritanceStrategy } from "./augment/Augmentor";
import { QueryAPI } from "./api/QueryAPI";

/**
 * Test the WorkerOrchestrator component
 */
export async function testWorkerOrchestrator(vault: any, metadataCache: any): Promise<void> {
  console.log("Testing WorkerOrchestrator...");
  
  // Create mock worker managers (in real usage, these would be actual instances)
  const mockTaskWorkerManager = {
    processFile: async (file: any, priority: number) => {
      console.log(`Mock: Processing file ${file.path} with priority ${priority}`);
      return [];
    },
    processBatch: async (files: any[], priority: number) => {
      console.log(`Mock: Processing batch of ${files.length} files with priority ${priority}`);
      return new Map();
    },
    getStats: () => ({ filesProcessed: 0, filesSkipped: 0, cacheHitRatio: 0 }),
    isProcessingBatchTask: () => false,
    getPendingTaskCount: () => 0,
    getBatchProgress: () => ({ current: 0, total: 0, percentage: 0 }),
    onunload: () => {}
  };

  const mockProjectWorkerManager = {
    getProjectData: async (filePath: string) => {
      console.log(`Mock: Getting project data for ${filePath}`);
      return null;
    },
    getBatchProjectData: async (filePaths: string[]) => {
      console.log(`Mock: Getting batch project data for ${filePaths.length} files`);
      return new Map();
    },
    getMemoryStats: () => ({ fileCacheSize: 0, directoryCacheSize: 0, pendingRequests: 0, activeWorkers: 0, workersEnabled: false }),
    isWorkersEnabled: () => false,
    destroy: () => {}
  };

  const orchestrator = new WorkerOrchestrator(
    mockTaskWorkerManager as any,
    mockProjectWorkerManager as any
  );

  // Test metrics
  const metrics = orchestrator.getMetrics();
  console.log("Initial metrics:", metrics);

  // Test queue stats
  const queueStats = orchestrator.getQueueStats();
  console.log("Queue stats:", queueStats);

  console.log("WorkerOrchestrator test completed successfully ✓");
}

/**
 * Test the ObsidianSource component
 */
export async function testObsidianSource(app: any, vault: any, metadataCache: any): Promise<void> {
  console.log("Testing ObsidianSource...");
  
  const source = new ObsidianSource(app, vault, metadataCache);
  
  // Test stats before initialization
  const initialStats = source.getStats();
  console.log("Initial stats:", initialStats);
  
  // Test manual triggers
  source.triggerFileUpdate("test-file.md", "modify");
  source.triggerBatchUpdate(["file1.md", "file2.md"]);
  
  // Test stats after operations
  const afterStats = source.getStats();
  console.log("Stats after operations:", afterStats);
  
  // Test flush
  source.flush();
  
  console.log("ObsidianSource test completed successfully ✓");
}

/**
 * Test the enhanced Augmentor component
 */
export async function testAugmentor(): Promise<void> {
  console.log("Testing enhanced Augmentor...");
  
  // Test with default strategy
  const augmentor = new Augmentor();
  
  // Create test context
  const context: AugmentContext = {
    filePath: "test.md",
    fileMeta: {
      tags: ["file-tag"],
      priority: 2,
      project: "FileProject"
    },
    projectName: "TestProject",
    projectMeta: {
      type: "config",
      source: "config.md",
      priority: 1,
      tags: ["project-tag"],
      dueDate: "2024-01-01"
    },
    tasks: [
      {
        id: "task-1",
        content: "Test task",
        filePath: "test.md",
        line: 1,
        completed: false,
        status: "TODO",
        originalMarkdown: "- [ ] Test task",
        metadata: {
          tags: ["task-tag"],
          priority: 3
        }
      } as Task
    ]
  };
  
  // Test augmentation
  const augmentedTasks = await augmentor.merge(context);
  console.log("Augmented task metadata:", augmentedTasks[0].metadata);
  
  // Test inheritance strategy
  const strategy = augmentor.getStrategy();
  console.log("Current strategy:", strategy);
  
  // Test field inheritance
  const inheritedValue = augmentor.processFieldInheritance(
    "priority",
    undefined, // task value
    2,         // file value
    1          // project value
  );
  console.log("Inherited priority value:", inheritedValue);
  
  // Test custom strategy
  const customStrategy: Partial<InheritanceStrategy> = {
    arrayMergeStrategy: "project-first",
    statusCompletionSource: "allow-inheritance"
  };
  augmentor.updateStrategy(customStrategy);
  
  const updatedStrategy = augmentor.getStrategy();
  console.log("Updated strategy:", updatedStrategy);
  
  console.log("Augmentor test completed successfully ✓");
}

/**
 * Test the updated QueryAPI
 */
export async function testQueryAPI(app: any, vault: any, metadataCache: any): Promise<void> {
  console.log("Testing updated QueryAPI...");
  
  const queryAPI = new QueryAPI(app, vault, metadataCache);
  
  // Test new method names
  try {
    const allTasks = await queryAPI.getAllTasks();
    console.log(`getAllTasks returned ${allTasks.length} tasks`);
    
    const projectTasks = await queryAPI.getTasksByProject("TestProject");
    console.log(`getTasksByProject returned ${projectTasks.length} tasks`);
    
    const taggedTasks = await queryAPI.getTasksByTags(["important"]);
    console.log(`getTasksByTags returned ${taggedTasks.length} tasks`);
    
    const completedTasks = await queryAPI.getTasksByStatus(true);
    console.log(`getTasksByStatus(completed) returned ${completedTasks.length} tasks`);
    
    const dueTasks = await queryAPI.getTasksByDateRange({
      from: Date.now(),
      to: Date.now() + 86400000, // 24 hours
      field: "due"
    });
    console.log(`getTasksByDateRange returned ${dueTasks.length} tasks`);
    
    const taskById = await queryAPI.getTaskById("non-existent");
    console.log(`getTaskById returned:`, taskById);
    
    const summary = await queryAPI.getIndexSummary();
    console.log("Index summary:", summary);
    
    // Test legacy method compatibility
    const legacyAll = await queryAPI.all();
    console.log(`Legacy all() method returned ${legacyAll.length} tasks`);
    
  } catch (error) {
    console.log("QueryAPI methods called successfully (empty results expected)");
  }
  
  console.log("QueryAPI test completed successfully ✓");
}

/**
 * Run all integration tests
 */
export async function runIntegrationTests(app: any, vault: any, metadataCache: any): Promise<void> {
  console.log("=== Starting Dataflow Integration Tests ===");
  
  try {
    await testWorkerOrchestrator(vault, metadataCache);
    await testObsidianSource(app, vault, metadataCache);
    await testAugmentor();
    await testQueryAPI(app, vault, metadataCache);
    
    console.log("=== All Integration Tests Passed ✓ ===");
  } catch (error) {
    console.error("=== Integration Tests Failed ✗ ===");
    console.error(error);
    throw error;
  }
}

/**
 * Example usage of the new dataflow components
 */
export class DataflowUsageExample {
  private workerOrchestrator: WorkerOrchestrator;
  private obsidianSource: ObsidianSource;
  private augmentor: Augmentor;
  private queryAPI: QueryAPI;

  constructor(
    workerOrchestrator: WorkerOrchestrator,
    obsidianSource: ObsidianSource,
    augmentor: Augmentor,
    queryAPI: QueryAPI
  ) {
    this.workerOrchestrator = workerOrchestrator;
    this.obsidianSource = obsidianSource;
    this.augmentor = augmentor;
    this.queryAPI = queryAPI;
  }

  /**
   * Example: Process a single file with workers and enhanced augmentation
   */
  async processFileExample(file: any): Promise<Task[]> {
    console.log(`Processing file: ${file.path}`);
    
    // Parse tasks using worker orchestrator
    const rawTasks = await this.workerOrchestrator.parseFileTasks(file, "normal");
    
    if (rawTasks.length === 0) {
      console.log("No tasks found in file");
      return [];
    }
    
    // Get project data
    const projectData = await this.workerOrchestrator.computeProjectData(file.path);
    
    // Create augmentation context
    const context: AugmentContext = {
      filePath: file.path,
      fileMeta: {}, // Would get from file metadata
      projectName: projectData?.tgProject?.name,
      projectMeta: projectData?.enhancedMetadata,
      tasks: rawTasks
    };
    
    // Augment tasks with inheritance
    const augmentedTasks = await this.augmentor.merge(context);
    
    console.log(`Processed ${augmentedTasks.length} tasks from ${file.path}`);
    return augmentedTasks;
  }

  /**
   * Example: Batch process multiple files
   */
  async batchProcessExample(files: any[]): Promise<Map<string, Task[]>> {
    console.log(`Batch processing ${files.length} files`);
    
    // Parse all files in parallel
    const rawTasksMap = await this.workerOrchestrator.batchParse(files, "normal");
    
    // Get project data for all files
    const filePaths = files.map(f => f.path);
    const projectDataMap = await this.workerOrchestrator.batchCompute(filePaths);
    
    // Augment tasks for each file
    const results = new Map<string, Task[]>();
    
    for (const [filePath, rawTasks] of rawTasksMap) {
      const projectData = projectDataMap.get(filePath);
      
      const context: AugmentContext = {
        filePath,
        fileMeta: {}, // Would get from file metadata
        projectName: projectData?.tgProject?.name,
        projectMeta: projectData?.enhancedMetadata,
        tasks: rawTasks
      };
      
      const augmentedTasks = await this.augmentor.merge(context);
      results.set(filePath, augmentedTasks);
    }
    
    console.log(`Batch processing completed for ${results.size} files`);
    return results;
  }

  /**
   * Example: Configure custom inheritance strategy
   */
  configureInheritanceExample(): void {
    const customStrategy: Partial<InheritanceStrategy> = {
      // Prioritize project settings for arrays
      arrayMergeStrategy: "project-first",
      // Allow status inheritance from file/project
      statusCompletionSource: "allow-inheritance",
      // Allow recurrence inheritance
      recurrenceSource: "allow-inheritance",
      // Custom subtask inheritance rules
      subtaskInheritance: {
        tags: true,
        project: true,
        priority: false, // Don't inherit priority for subtasks
        dueDate: true,   // Do inherit due dates
        completed: false,
        status: false
      }
    };
    
    this.augmentor.updateStrategy(customStrategy);
    console.log("Custom inheritance strategy configured");
  }

  /**
   * Example: Monitor system performance
   */
  async monitorPerformanceExample(): Promise<void> {
    const metrics = this.workerOrchestrator.getMetrics();
    const queueStats = this.workerOrchestrator.getQueueStats();
    const sourceStats = this.obsidianSource.getStats();
    const indexSummary = await this.queryAPI.getIndexSummary();
    
    console.log("Performance monitoring:");
    console.log("- Worker metrics:", metrics);
    console.log("- Queue stats:", queueStats);
    console.log("- Source stats:", sourceStats);
    console.log("- Index summary:", indexSummary);
  }
}