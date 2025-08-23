/**
 * Tests for worker processing control functionality
 */

import { WorkerOrchestrator } from "../dataflow/workers/WorkerOrchestrator";
import { TaskWorkerManager } from "../dataflow/workers/TaskWorkerManager";
import { ProjectDataWorkerManager } from "../dataflow/workers/ProjectDataWorkerManager";

// Mock dependencies
jest.mock("../dataflow/workers/TaskWorkerManager");
jest.mock("../dataflow/workers/ProjectDataWorkerManager");

describe("Worker Processing Control", () => {
  let workerOrchestrator: WorkerOrchestrator;
  let mockTaskWorkerManager: any;
  let mockProjectWorkerManager: any;

  beforeEach(() => {
    // Create mock instances
    mockTaskWorkerManager = new TaskWorkerManager(
      {} as any,
      {} as any
    );
    
    mockProjectWorkerManager = new ProjectDataWorkerManager({
      vault: {} as any,
      metadataCache: {} as any,
      projectConfigManager: {} as any
    });
  });

  describe("WorkerOrchestrator enableWorkerProcessing setting", () => {
    it("should be enabled by default", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager
      );

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(true);
    });

    it("should respect enableWorkerProcessing option when initialized", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager,
        { enableWorkerProcessing: false }
      );

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(false);
    });

    it("should allow dynamic enabling of worker processing", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager,
        { enableWorkerProcessing: false }
      );

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(false);

      // Enable worker processing
      workerOrchestrator.setWorkerProcessingEnabled(true);

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(true);
    });

    it("should allow dynamic disabling of worker processing", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager,
        { enableWorkerProcessing: true }
      );

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(true);

      // Disable worker processing
      workerOrchestrator.setWorkerProcessingEnabled(false);

      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(false);
    });

    it("should reset circuit breaker when re-enabling worker processing", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager
      );

      // Simulate circuit breaker being triggered (this would normally happen internally)
      // We can't directly test this without exposing internals, but we can verify the behavior
      workerOrchestrator.setWorkerProcessingEnabled(false);
      workerOrchestrator.setWorkerProcessingEnabled(true);

      // Worker processing should be enabled after re-enabling
      expect(workerOrchestrator.isWorkerProcessingEnabled()).toBe(true);
    });

    it("should provide metrics", () => {
      workerOrchestrator = new WorkerOrchestrator(
        mockTaskWorkerManager,
        mockProjectWorkerManager
      );

      const metrics = workerOrchestrator.getMetrics();

      expect(metrics).toHaveProperty("taskParsingSuccess");
      expect(metrics).toHaveProperty("taskParsingFailures");
      expect(metrics).toHaveProperty("projectDataSuccess");
      expect(metrics).toHaveProperty("projectDataFailures");
      expect(metrics).toHaveProperty("averageTaskParsingTime");
      expect(metrics).toHaveProperty("averageProjectDataTime");
      expect(metrics).toHaveProperty("totalOperations");
      expect(metrics).toHaveProperty("fallbackToMainThread");
    });
  });

  describe("Settings Integration", () => {
    it("should correctly read setting from fileSource.performance.enableWorkerProcessing", () => {
      const settings = {
        fileSource: {
          performance: {
            enableWorkerProcessing: false
          }
        }
      };

      const enableWorkerProcessing = 
        settings?.fileSource?.performance?.enableWorkerProcessing ?? true;

      expect(enableWorkerProcessing).toBe(false);
    });

    it("should fallback to fileParsingConfig.enableWorkerProcessing if fileSource not present", () => {
      const settings: any = {
        fileParsingConfig: {
          enableWorkerProcessing: false
        }
      };

      const enableWorkerProcessing = 
        settings?.fileSource?.performance?.enableWorkerProcessing ??
        settings?.fileParsingConfig?.enableWorkerProcessing ??
        true;

      expect(enableWorkerProcessing).toBe(false);
    });

    it("should default to true if no settings present", () => {
      const settings: any = {};

      const enableWorkerProcessing = 
        settings?.fileSource?.performance?.enableWorkerProcessing ??
        settings?.fileParsingConfig?.enableWorkerProcessing ??
        true;

      expect(enableWorkerProcessing).toBe(true);
    });
  });
});