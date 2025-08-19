/**
 * Timeline Canvas Integration Tests
 *
 * Tests to verify that Canvas task completion works correctly in the Timeline feature
 */

import { Task, CanvasTaskMetadata } from "../types/task";
import { CanvasTaskUpdater } from "../parsers/canvas-task-updater";
import { CanvasData } from "../types/canvas";

// Mock Vault and TFile (same as CanvasTaskUpdater.test.ts)
class MockVault {
    private files: Map<string, string> = new Map();

    getFileByPath(path: string) {
        if (this.files.has(path)) {
            return new MockTFile(path);
        }
        return null;
    }

    async read(file: MockTFile): Promise<string> {
        return this.files.get(file.path) || '';
    }

    async modify(file: MockTFile, content: string): Promise<void> {
        this.files.set(file.path, content);
    }

    setFileContent(path: string, content: string): void {
        this.files.set(path, content);
    }

    getFileContent(path: string): string | undefined {
        return this.files.get(path);
    }

    createFile(path: string, content: string): MockTFile {
        this.files.set(path, content);
        return new MockTFile(path);
    }
}

class MockTFile {
    constructor(public path: string) {}

    get name() {
        return this.path.split('/').pop() || '';
    }

    get extension() {
        return this.path.split('.').pop() || '';
    }
}

// Mock Plugin (same as CanvasTaskUpdater.test.ts)
class MockPlugin {
    settings = {
        preferMetadataFormat: 'tasks' as const,
        projectTagPrefix: {
            tasks: 'project',
            dataview: 'project'
        },
        contextTagPrefix: {
            tasks: '@',
            dataview: 'context'
        }
    };
}

describe('Timeline Canvas Integration', () => {
    let mockPlugin: MockPlugin;
    let mockVault: MockVault;
    let canvasTaskUpdater: CanvasTaskUpdater;

    beforeEach(() => {
        mockPlugin = new MockPlugin();
        mockVault = new MockVault();

        // Initialize CanvasTaskUpdater
        canvasTaskUpdater = new CanvasTaskUpdater(mockVault as any, mockPlugin as any);
    });

    describe('Canvas Task Identification', () => {
        it('should correctly identify Canvas tasks', () => {
            const canvasTask: Task<CanvasTaskMetadata> = {
                id: 'canvas-task-1',
                content: 'Canvas task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Canvas task',
                metadata: {
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1',
                    tags: [],
                    children: []
                }
            };

            const markdownTask: Task = {
                id: 'markdown-task-1',
                content: 'Markdown task',
                filePath: 'test.md',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Markdown task',
                metadata: {
                    tags: [],
                    children: []
                }
            };

            expect(CanvasTaskUpdater.isCanvasTask(canvasTask)).toBe(true);
            expect(CanvasTaskUpdater.isCanvasTask(markdownTask)).toBe(false);
        });
    });

    describe('Canvas Task Completion in Timeline', () => {
        it('should successfully complete Canvas tasks through TaskManager', async () => {
            // Create a Canvas file with a task
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'test-node',
                        type: 'text',
                        text: '# Test Canvas\n\n- [ ] Test Canvas task',
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200
                    }
                ],
                edges: []
            };

            const canvasFile = mockVault.createFile('test.canvas', JSON.stringify(canvasData, null, 2));

            // Create a Canvas task
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-canvas-task',
                content: 'Test Canvas task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test Canvas task',
                metadata: {
                    sourceType: 'canvas',
                    canvasNodeId: 'test-node',
                    tags: [],
                    children: []
                }
            };

            // Create updated task (completed)
            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x',
                metadata: {
                    ...originalTask.metadata,
                    completedDate: Date.now()
                }
            };

            // Test Canvas task update directly
            const result = await canvasTaskUpdater.updateCanvasTask(originalTask, updatedTask);
            
            expect(result.success).toBe(true);

            // Verify the Canvas file was updated
            const updatedContent = mockVault.getFileContent('test.canvas');
            expect(updatedContent).toBeDefined();
            
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'test-node');
            
            expect(updatedNode.text).toContain('- [x] Test Canvas task');
        });

        it('should handle Canvas task completion through Timeline toggleTaskCompletion flow', async () => {
            // This test simulates the Timeline's task completion flow
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'timeline-test-node',
                        type: 'text',
                        text: '# Timeline Test\n\n- [ ] Timeline Canvas task 📅 2025-01-15',
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200
                    }
                ],
                edges: []
            };

            mockVault.createFile('timeline-test.canvas', JSON.stringify(canvasData, null, 2));

            const canvasTask: Task<CanvasTaskMetadata> = {
                id: 'timeline-canvas-task',
                content: 'Timeline Canvas task',  // Content should be clean task text
                filePath: 'timeline-test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Timeline Canvas task 📅 2025-01-15',  // This should match the Canvas file exactly
                metadata: {
                    sourceType: 'canvas',
                    canvasNodeId: 'timeline-test-node',
                    dueDate: new Date('2025-01-15').getTime(),
                    tags: [],
                    children: []
                }
            };

            // Simulate the Timeline's toggleTaskCompletion logic
            const updatedTask = { ...canvasTask, completed: !canvasTask.completed };

            if (updatedTask.completed) {
                updatedTask.metadata.completedDate = Date.now();
                updatedTask.status = 'x';
            }

            // Test that CanvasTaskUpdater.isCanvasTask correctly identifies this task
            expect(CanvasTaskUpdater.isCanvasTask(canvasTask)).toBe(true);

            // Test the Canvas task update
            const result = await canvasTaskUpdater.updateCanvasTask(canvasTask, updatedTask);

            if (!result.success) {
                console.log('Canvas task update failed:', result.error);
            }
            expect(result.success).toBe(true);

            // Verify the Canvas file was updated correctly
            const updatedContent = mockVault.getFileContent('timeline-test.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'timeline-test-node');

            expect(updatedNode.text).toContain('- [x] Timeline Canvas task');
            expect(updatedNode.text).toContain('📅 2025-01-15');

            // Should also contain completion date
            const today = new Date();
            const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            expect(updatedNode.text).toContain(`✅ ${expectedDate}`);
        });

        it('should handle Canvas task completion with originalMarkdown matching', async () => {
            // Test the improved originalMarkdown matching logic
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'matching-test-node',
                        type: 'text',
                        text: '# Matching Test\n\n- [ ] Task with complex metadata #project/test @home ⏫ 📅 2025-01-20',
                        x: 100,
                        y: 100,
                        width: 400,
                        height: 250
                    }
                ],
                edges: []
            };

            mockVault.createFile('matching-test.canvas', JSON.stringify(canvasData, null, 2));

            const complexTask: Task<CanvasTaskMetadata> = {
                id: 'complex-canvas-task',
                content: 'Task with complex metadata',
                filePath: 'matching-test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Task with complex metadata #project/test @home ⏫ 📅 2025-01-20',
                metadata: {
                    sourceType: 'canvas',
                    canvasNodeId: 'matching-test-node',
                    dueDate: new Date('2025-01-20').getTime(),
                    priority: 4,
                    project: 'test',
                    context: 'home',
                    tags: ['#project/test'],
                    children: []
                }
            };

            // Complete the task
            const completedTask = {
                ...complexTask,
                completed: true,
                status: 'x',
                metadata: {
                    ...complexTask.metadata,
                    completedDate: Date.now()
                }
            };

            const result = await canvasTaskUpdater.updateCanvasTask(complexTask, completedTask);

            expect(result.success).toBe(true);

            // Verify the task was found and updated correctly
            const updatedContent = mockVault.getFileContent('matching-test.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'matching-test-node');

            expect(updatedNode.text).toContain('- [x] Task with complex metadata');
            expect(updatedNode.text).toContain('#project/test');
            expect(updatedNode.text).toContain('@home');
            expect(updatedNode.text).toContain('⏫');
            expect(updatedNode.text).toContain('📅 2025-01-20');

            // Should contain completion date
            const today = new Date();
            const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            expect(updatedNode.text).toContain(`✅ ${expectedDate}`);
        });
    });
});
