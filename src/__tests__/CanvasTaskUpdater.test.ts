/**
 * Tests for Canvas task updater functionality
 */

import { CanvasTaskUpdater } from '../utils/parsing/CanvasTaskUpdater';
import { Task, CanvasTaskMetadata } from '../types/task';
import { CanvasData } from '../types/canvas';

// Mock Vault and TFile
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
}

class MockTFile {
    constructor(public path: string) {}

    // Add properties to make it compatible with TFile interface
    get name() {
        return this.path.split('/').pop() || '';
    }

    get extension() {
        return this.path.split('.').pop() || '';
    }
}

// Mock Plugin
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

describe('CanvasTaskUpdater', () => {
    let mockVault: MockVault;
    let mockPlugin: MockPlugin;
    let updater: CanvasTaskUpdater;

    beforeEach(() => {
        mockVault = new MockVault();
        mockPlugin = new MockPlugin();
        updater = new CanvasTaskUpdater(mockVault as any, mockPlugin as any);
    });

    describe('isCanvasTask', () => {
        it('should identify Canvas tasks correctly', () => {
            const canvasTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Test task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const markdownTask: Task = {
                id: 'test-2',
                content: 'Test task',
                filePath: 'test.md',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: []
                }
            };

            expect(CanvasTaskUpdater.isCanvasTask(canvasTask)).toBe(true);
            expect(CanvasTaskUpdater.isCanvasTask(markdownTask)).toBe(false);
        });
    });

    describe('updateCanvasTask', () => {
        const sampleCanvasData: CanvasData = {
            nodes: [
                {
                    id: 'node-1',
                    type: 'text',
                    text: '# Test Node\n\n- [ ] Original task\n- [x] Completed task',
                    x: 100,
                    y: 100,
                    width: 300,
                    height: 200
                },
                {
                    id: 'node-2',
                    type: 'text',
                    text: '# Another Node\n\n- [ ] Another task',
                    x: 400,
                    y: 100,
                    width: 300,
                    height: 200
                }
            ],
            edges: []
        };

        beforeEach(() => {
            mockVault.setFileContent('test.canvas', JSON.stringify(sampleCanvasData, null, 2));
        });

        it('should update task status in Canvas file', async () => {
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Original task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Original task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x'
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            if (!result.success) {
                throw new Error(`Update failed with error: ${result.error}`);
            }

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            // Verify the Canvas file was updated
            const updatedContent = mockVault.getFileContent('test.canvas');
            expect(updatedContent).toBeDefined();
            
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'node-1');
            expect(updatedNode.text).toContain('- [x] Original task');
        });

        it('should handle missing Canvas file', async () => {
            const task: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Test task',
                filePath: 'nonexistent.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const result = await updater.updateCanvasTask(task, task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Canvas file not found');
        });

        it('should handle missing Canvas node ID', async () => {
            const task: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Test task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas'
                    // Missing canvasNodeId
                }
            };

            const result = await updater.updateCanvasTask(task, task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('does not have a Canvas node ID');
        });

        it('should handle missing Canvas node', async () => {
            const task: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Test task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'nonexistent-node'
                }
            };

            const result = await updater.updateCanvasTask(task, task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Canvas text node not found');
        });

        it('should handle invalid Canvas JSON', async () => {
            mockVault.setFileContent('test.canvas', 'invalid json');

            const task: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Test task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Test task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const result = await updater.updateCanvasTask(task, task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to parse Canvas JSON');
        });

        it('should handle task not found in node', async () => {
            const task: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Nonexistent task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Nonexistent task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const result = await updater.updateCanvasTask(task, task);

            expect(result.success).toBe(false);
            expect(result.error).toContain('Task not found in Canvas text node');
        });

        it('should update multiple different task statuses', async () => {
            // Test updating from incomplete to complete
            const task1: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Original task',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Original task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const updatedTask1 = { ...task1, completed: true, status: 'x' };
            await updater.updateCanvasTask(task1, updatedTask1);

            // Test updating from complete to incomplete
            const task2: Task<CanvasTaskMetadata> = {
                id: 'test-2',
                content: 'Completed task',
                filePath: 'test.canvas',
                line: 0,
                completed: true,
                status: 'x',
                originalMarkdown: '- [x] Completed task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const updatedTask2 = { ...task2, completed: false, status: ' ' };
            const result = await updater.updateCanvasTask(task2, updatedTask2);

            expect(result.success).toBe(true);

            // Verify both updates
            const updatedContent = mockVault.getFileContent('test.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'node-1');
            
            expect(updatedNode.text).toContain('- [x] Original task');
            expect(updatedNode.text).toContain('- [ ] Completed task');
        });

        it('should update task with due date metadata', async () => {
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Task with due date',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Task with due date',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const dueDate = new Date('2024-12-25').getTime();
            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                content: 'Task with due date',
                metadata: {
                    ...originalTask.metadata,
                    dueDate: dueDate
                }
            };

            // First, add the task to the canvas
            const canvasData = JSON.parse(mockVault.getFileContent('test.canvas')!);
            canvasData.nodes[0].text = '# Test Node\n\n- [ ] Task with due date\n- [x] Completed task';
            mockVault.setFileContent('test.canvas', JSON.stringify(canvasData, null, 2));

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            // Verify the Canvas file was updated with due date
            const updatedContent = mockVault.getFileContent('test.canvas');
            expect(updatedContent).toBeDefined();

            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'node-1');
            expect(updatedNode.text).toContain('Task with due date 📅 2024-12-25');
        });

        it('should update task with priority and tags', async () => {
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Task with metadata',
                filePath: 'test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Task with metadata',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'node-1'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                content: 'Task with metadata',
                metadata: {
                    ...originalTask.metadata,
                    priority: 4,
                    tags: ['#important', '#work'],
                    project: 'TestProject',
                    context: 'office'
                }
            };

            // First, add the task to the canvas
            const canvasData = JSON.parse(mockVault.getFileContent('test.canvas')!);
            canvasData.nodes[0].text = '# Test Node\n\n- [ ] Task with metadata\n- [x] Completed task';
            mockVault.setFileContent('test.canvas', JSON.stringify(canvasData, null, 2));

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();

            // Verify the Canvas file was updated with metadata
            const updatedContent = mockVault.getFileContent('test.canvas');
            expect(updatedContent).toBeDefined();

            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'node-1');

            // Check for tags, project, context, and priority
            expect(updatedNode.text).toContain('#important');
            expect(updatedNode.text).toContain('#work');
            expect(updatedNode.text).toContain('#project/TestProject');
            expect(updatedNode.text).toContain('@office');
            expect(updatedNode.text).toContain('⏫'); // High priority emoji
        });

        it('should handle multiple tasks with same name correctly', async () => {
            // Create a complex canvas with multiple same-named tasks
            const complexCanvasData: CanvasData = {
                nodes: [
                    {
                        id: 'project-planning',
                        type: 'text',
                        text: '# Project Planning\n\n## Initial Setup\n- [ ] Define project scope\n- [ ] Set up development environment\n- [x] Create project repository\n- [ ] Configure CI/CD pipeline\n\n## Research Phase\n- [ ] Market research\n- [ ] Competitor analysis\n- [ ] Technology stack evaluation',
                        x: 100,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '1'
                    },
                    {
                        id: 'development-tasks',
                        type: 'text',
                        text: '# Development Tasks\n\n## Frontend\n- [ ] Design user interface mockups\n- [ ] Implement responsive layout\n- [ ] Add user authentication\n- [ ] Create dashboard components\n\n## Backend\n- [ ] Set up database schema\n- [ ] Implement REST API\n- [ ] Add data validation\n- [ ] Configure security middleware',
                        x: 500,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '2'
                    },
                    {
                        id: 'testing-qa',
                        type: 'text',
                        text: '# Testing & QA\n\n## Unit Testing\n- [ ] Write component tests\n- [ ] API endpoint tests\n- [ ] Database integration tests\n\n## Integration Testing\n- [ ] End-to-end testing\n- [ ] Performance testing\n- [ ] Security testing\n\n## Quality Assurance\n- [ ] Code review process\n- [ ] Documentation review\n- [ ] User acceptance testing',
                        x: 100,
                        y: 420,
                        width: 350,
                        height: 300,
                        color: '3'
                    },
                    {
                        id: 'deployment',
                        type: 'text',
                        text: '# Deployment & Maintenance\n\n## Deployment\n- [ ] Set up production environment\n- [ ] Configure monitoring\n- [ ] Deploy application\n- [ ] Verify deployment\n\n## Post-Launch\n- [ ] Monitor performance\n- [ ] Gather user feedback\n- [ ] Bug fixes and improvements\n- [ ] Feature enhancements',
                        x: 500,
                        y: 420,
                        width: 350,
                        height: 300,
                        color: '4'
                    },
                    {
                        id: 'meeting-notes',
                        type: 'text',
                        text: '# Meeting Notes\n\n## Daily Standup - 2024-01-15\n- [x] Discussed project progress\n- [ ] Review sprint goals\n- [ ] Address blockers\n\n## Sprint Planning\n- [ ] Estimate story points\n- [ ] Assign tasks to team members\n- [ ] Set sprint timeline',
                        x: 900,
                        y: 280,
                        width: 300,
                        height: 250,
                        color: '5'
                    }
                ],
                edges: [
                    {
                        id: 'edge1',
                        fromNode: 'project-planning',
                        toNode: 'development-tasks',
                        fromSide: 'right',
                        toSide: 'left'
                    },
                    {
                        id: 'edge2',
                        fromNode: 'development-tasks',
                        toNode: 'testing-qa',
                        fromSide: 'bottom',
                        toSide: 'top'
                    },
                    {
                        id: 'edge3',
                        fromNode: 'testing-qa',
                        toNode: 'deployment',
                        fromSide: 'right',
                        toSide: 'left'
                    }
                ]
            };

            mockVault.setFileContent('complex.canvas', JSON.stringify(complexCanvasData, null, 2));

            // Test updating a specific task in the first node
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Define project scope',
                filePath: 'complex.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Define project scope',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'project-planning'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x'
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);

            // Verify only the correct task was updated
            const updatedContent = mockVault.getFileContent('complex.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'project-planning');

            expect(updatedNode.text).toContain('- [x] Define project scope');
            expect(updatedNode.text).toContain('- [ ] Set up development environment'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [x] Create project repository'); // Should remain unchanged
        });

        it('should handle tasks with identical names and metadata correctly', async () => {
            // Create a canvas with multiple identical task names but different metadata
            const identicalTasksCanvasData: CanvasData = {
                nodes: [
                    {
                        id: 'identical-tasks-node',
                        type: 'text',
                        text: '# Tasks with Same Names\n\n- [ ] Task In Canvas 📅 2025-06-21\n- [ ] Task In Canvas 🛫 2025-06-21\n- [ ] Task In Canvas #SO/旅行\n- [ ] Task In Canvas\n- [ ] A new day',
                        x: 100,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '1'
                    }
                ],
                edges: []
            };

            mockVault.setFileContent('identical-tasks.canvas', JSON.stringify(identicalTasksCanvasData, null, 2));

            // Test updating the third task (with #SO/旅行 tag)
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Task In Canvas',
                filePath: 'identical-tasks.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Task In Canvas #SO/旅行',
                metadata: {
                    tags: ['#SO/旅行'],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'identical-tasks-node'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x'
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);

            // Verify only the correct task was updated
            const updatedContent = mockVault.getFileContent('identical-tasks.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'identical-tasks-node');

            // Check that only the task with #SO/旅行 was updated
            expect(updatedNode.text).toContain('- [ ] Task In Canvas 📅 2025-06-21'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [ ] Task In Canvas 🛫 2025-06-21'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [x] Task In Canvas #SO/旅行'); // Should be updated
            expect(updatedNode.text).toContain('- [ ] Task In Canvas'); // Should remain unchanged (plain task)
            expect(updatedNode.text).toContain('- [ ] A new day'); // Should remain unchanged
        });

        it('should properly remove and add metadata without affecting other tasks', async () => {
            // Create a canvas with tasks that have metadata to be removed/modified
            const metadataTestCanvasData: CanvasData = {
                nodes: [
                    {
                        id: 'metadata-test-node',
                        type: 'text',
                        text: '# Metadata Test\n\n- [ ] Task with due date 📅 2025-06-21\n- [ ] Task with start date 🛫 2025-06-20\n- [ ] Task with priority ⏫\n- [ ] Task with multiple metadata 📅 2025-06-21 🛫 2025-06-20 #important @work',
                        x: 100,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '1'
                    }
                ],
                edges: []
            };

            mockVault.setFileContent('metadata-test.canvas', JSON.stringify(metadataTestCanvasData, null, 2));

            // Test removing due date from the first task
            // Note: lineMatchesTask only compares content, not the full originalMarkdown
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Task with due date 📅 2025-06-21', // This should match the line content after removing checkbox
                filePath: 'metadata-test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Task with due date 📅 2025-06-21',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'metadata-test-node',
                    dueDate: new Date('2025-06-21').getTime()
                }
            };

            // Update task to remove due date
            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                content: 'Task with due date', // Remove metadata from content
                metadata: {
                    ...originalTask.metadata,
                    dueDate: undefined // Remove due date
                }
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);

            // Verify metadata was properly removed from the correct task only
            const updatedContent = mockVault.getFileContent('metadata-test.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'metadata-test-node');

            // Check that due date was removed from the first task
            expect(updatedNode.text).toContain('- [ ] Task with due date\n'); // Should not contain 📅 2025-06-21
            expect(updatedNode.text).not.toMatch(/- \[ \] Task with due date 📅 2025-06-21/);

            // Check that other tasks remain unchanged
            expect(updatedNode.text).toContain('- [ ] Task with start date 🛫 2025-06-20');
            expect(updatedNode.text).toContain('- [ ] Task with priority ⏫');
            expect(updatedNode.text).toContain('- [ ] Task with multiple metadata 📅 2025-06-21 🛫 2025-06-20 #important @work');
        });

        it('should handle updating tasks when multiple tasks have similar content', async () => {
            // Test edge case where task content is very similar
            const similarTasksCanvasData: CanvasData = {
                nodes: [
                    {
                        id: 'similar-tasks-node',
                        type: 'text',
                        text: '# Similar Tasks\n\n- [ ] Review code\n- [ ] Review code changes\n- [ ] Review code for bugs\n- [x] Review code completely\n- [ ] Review',
                        x: 100,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '1'
                    }
                ],
                edges: []
            };

            mockVault.setFileContent('similar-tasks.canvas', JSON.stringify(similarTasksCanvasData, null, 2));

            // Test updating the exact "Review code" task (first one)
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Review code',
                filePath: 'similar-tasks.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Review code',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'similar-tasks-node'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x'
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);

            // Verify only the exact match was updated
            const updatedContent = mockVault.getFileContent('similar-tasks.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'similar-tasks-node');

            // Check that only the exact "Review code" task was updated
            expect(updatedNode.text).toContain('- [x] Review code\n'); // First task should be updated
            expect(updatedNode.text).toContain('- [ ] Review code changes'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [ ] Review code for bugs'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [x] Review code completely'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [ ] Review'); // Should remain unchanged
        });

        it('should handle canvas file monitoring and updates correctly', async () => {
            // This test simulates the file monitoring scenario
            // Create a canvas with tasks
            const monitoringTestCanvasData: CanvasData = {
                nodes: [
                    {
                        id: 'monitoring-test-node',
                        type: 'text',
                        text: '# File Monitoring Test\n\n- [ ] Initial task\n- [ ] Another task\n- [x] Completed task',
                        x: 100,
                        y: 100,
                        width: 350,
                        height: 280,
                        color: '1'
                    }
                ],
                edges: []
            };

            mockVault.setFileContent('monitoring-test.canvas', JSON.stringify(monitoringTestCanvasData, null, 2));

            // Simulate updating a task as if it was modified in the Canvas file
            const originalTask: Task<CanvasTaskMetadata> = {
                id: 'test-1',
                content: 'Initial task',
                filePath: 'monitoring-test.canvas',
                line: 0,
                completed: false,
                status: ' ',
                originalMarkdown: '- [ ] Initial task',
                metadata: {
                    tags: [],
                    children: [],
                    sourceType: 'canvas',
                    canvasNodeId: 'monitoring-test-node'
                }
            };

            const updatedTask: Task<CanvasTaskMetadata> = {
                ...originalTask,
                completed: true,
                status: 'x',
                metadata: {
                    ...originalTask.metadata,
                    completedDate: Date.now()
                }
            };

            const result = await updater.updateCanvasTask(originalTask, updatedTask);

            expect(result.success).toBe(true);

            // Verify the Canvas file was updated correctly
            const updatedContent = mockVault.getFileContent('monitoring-test.canvas');
            const updatedCanvasData = JSON.parse(updatedContent!);
            const updatedNode = updatedCanvasData.nodes.find((n: any) => n.id === 'monitoring-test-node');

            // Check that the task was updated and completion date was added
            expect(updatedNode.text).toContain('- [x] Initial task');
            expect(updatedNode.text).toContain('- [ ] Another task'); // Should remain unchanged
            expect(updatedNode.text).toContain('- [x] Completed task'); // Should remain unchanged

            // Verify completion date was added
            const today = new Date();
            const expectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            expect(updatedNode.text).toContain(`✅ ${expectedDate}`);
        });
    });
});
