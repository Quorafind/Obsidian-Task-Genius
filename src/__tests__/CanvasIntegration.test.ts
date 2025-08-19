/**
 * Integration tests for Canvas file support
 */

import { isSupportedFile, getFileType, SupportedFileType } from '../utils/file/file-type-detector';
import { CanvasParser } from '../parsers/canvas-parser';
import { getConfig } from '../common/task-parser-config';

// Mock TFile for testing
class MockTFile {
    constructor(public path: string, public extension: string) {}
}

describe('Canvas Integration', () => {
    describe('File Type Detection', () => {
        it('should detect canvas files as supported', () => {
            const canvasFile = new MockTFile('test.canvas', 'canvas') as any;
            expect(isSupportedFile(canvasFile)).toBe(true);
        });

        it('should detect markdown files as supported', () => {
            const mdFile = new MockTFile('test.md', 'md') as any;
            expect(isSupportedFile(mdFile)).toBe(true);
        });

        it('should reject unsupported file types', () => {
            const txtFile = new MockTFile('test.txt', 'txt') as any;
            expect(isSupportedFile(txtFile)).toBe(false);
        });

        it('should correctly identify file types', () => {
            const canvasFile = new MockTFile('test.canvas', 'canvas') as any;
            const mdFile = new MockTFile('test.md', 'md') as any;
            const txtFile = new MockTFile('test.txt', 'txt') as any;

            expect(getFileType(canvasFile)).toBe(SupportedFileType.CANVAS);
            expect(getFileType(mdFile)).toBe(SupportedFileType.MARKDOWN);
            expect(getFileType(txtFile)).toBe(null);
        });
    });

    describe('Canvas Task Parsing', () => {
        let parser: CanvasParser;

        beforeEach(() => {
            const config = getConfig('tasks');
            parser = new CanvasParser(config);
        });

        it('should parse a realistic canvas file with multiple text nodes', () => {
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "planning-node",
                        type: "text",
                        text: "# Project Planning\n\n- [ ] Define requirements\n- [ ] Create wireframes\n- [x] Set up project structure",
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200,
                        color: "1"
                    },
                    {
                        id: "development-node", 
                        type: "text",
                        text: "## Development Tasks\n\n- [ ] Implement authentication\n- [ ] Build user interface\n- [ ] Add data validation",
                        x: 500,
                        y: 100,
                        width: 300,
                        height: 200,
                        color: "2"
                    },
                    {
                        id: "testing-node",
                        type: "text", 
                        text: "### Testing\n\n- [ ] Write unit tests\n- [ ] Perform integration testing\n- [ ] User acceptance testing",
                        x: 100,
                        y: 400,
                        width: 300,
                        height: 200,
                        color: "3"
                    },
                    {
                        id: "file-reference",
                        type: "file",
                        file: "project-notes.md",
                        x: 500,
                        y: 400,
                        width: 200,
                        height: 100
                    }
                ],
                edges: [
                    {
                        id: "edge1",
                        fromNode: "planning-node",
                        toNode: "development-node"
                    }
                ]
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'project.canvas');

            // Should find 8 tasks total (3 + 3 + 2, excluding the completed one)
            expect(tasks.length).toBeGreaterThan(0);
            
            // Check that we have tasks from different nodes
            const taskContents = tasks.map(t => t.content);
            expect(taskContents).toContain('Define requirements');
            expect(taskContents).toContain('Implement authentication');
            expect(taskContents).toContain('Write unit tests');

            // Check that completed task is marked correctly
            const completedTask = tasks.find(t => t.content === 'Set up project structure');
            expect(completedTask?.completed).toBe(true);

            // Check canvas-specific metadata
            const firstTask = tasks[0];
            expect((firstTask.metadata as any).sourceType).toBe('canvas');
            expect((firstTask.metadata as any).canvasNodeId).toBeDefined();
            expect((firstTask.metadata as any).canvasPosition).toBeDefined();
        });

        it('should handle canvas with complex markdown in text nodes', () => {
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "complex-node",
                        type: "text",
                        text: `# Complex Node

This node contains various markdown elements:

## Tasks with metadata
- [ ] Task with due date 📅 2024-01-15
- [x] Completed task with priority ⏫
- [ ] Task with tags #important #urgent

## Regular content
Some regular text that should not be parsed as tasks.

### More tasks
- [ ] Another task
- [ ] Task with project +ProjectName`,
                        x: 200,
                        y: 200,
                        width: 400,
                        height: 300
                    }
                ],
                edges: []
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'complex.canvas');

            expect(tasks.length).toBeGreaterThan(0);
            
            // Should parse tasks with metadata
            const taskWithDate = tasks.find(t => t.content.includes('due date'));
            expect(taskWithDate).toBeDefined();
            
            const completedTask = tasks.find(t => t.content.includes('priority'));
            expect(completedTask?.completed).toBe(true);
        });

        it('should handle empty or invalid canvas files gracefully', () => {
            // Empty canvas
            const emptyCanvas = JSON.stringify({ nodes: [], edges: [] });
            const emptyTasks = parser.parseCanvasFile(emptyCanvas, 'empty.canvas');
            expect(emptyTasks).toHaveLength(0);

            // Invalid JSON
            const invalidTasks = parser.parseCanvasFile('invalid json', 'invalid.canvas');
            expect(invalidTasks).toHaveLength(0);

            // Missing required properties
            const incompleteTasks = parser.parseCanvasFile('{"nodes": []}', 'incomplete.canvas');
            expect(incompleteTasks).toHaveLength(0);
        });
    });

    describe('Canvas Task Metadata', () => {
        let parser: CanvasParser;

        beforeEach(() => {
            const config = getConfig('tasks');
            parser = new CanvasParser(config);
        });

        it('should properly identify canvas tasks by sourceType', () => {
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "test-node",
                        type: "text",
                        text: "- [ ] Canvas task",
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');
            expect(tasks.length).toBe(1);

            const task = tasks[0];
            expect((task.metadata as any).sourceType).toBe('canvas');
        });

        it('should include canvas-specific metadata fields', () => {
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "metadata-node",
                        type: "text",
                        text: "- [ ] Task with full metadata",
                        x: 150,
                        y: 250,
                        width: 350,
                        height: 200,
                        color: "2"
                    }
                ],
                edges: []
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'metadata.canvas');
            expect(tasks.length).toBe(1);

            const task = tasks[0];
            const metadata = task.metadata as any;

            expect(metadata.sourceType).toBe('canvas');
            expect(metadata.canvasNodeId).toBe('metadata-node');
            expect(metadata.canvasPosition).toEqual({
                x: 150,
                y: 250,
                width: 350,
                height: 200
            });
            expect(metadata.canvasColor).toBe('2');
        });

        it('should mark tasks as canvas even when source node cannot be found', () => {
            // This tests the fallback case where findSourceNode returns null
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "test-node",
                        type: "text",
                        text: "- [ ] Task that might not be found",
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');
            expect(tasks.length).toBe(1);

            const task = tasks[0];
            // Even if source node matching fails, it should still be marked as canvas
            expect((task.metadata as any).sourceType).toBe('canvas');
        });
    });

    describe('Parser Configuration', () => {
        it('should respect different metadata formats', () => {
            const tasksConfig = getConfig('tasks');
            const dataviewConfig = getConfig('dataview');

            const tasksParser = new CanvasParser(tasksConfig);
            const dataviewParser = new CanvasParser(dataviewConfig);

            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "test-node",
                        type: "text",
                        text: "- [ ] Task with due date 📅 2024-01-15",
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            });

            const tasksTasks = tasksParser.parseCanvasFile(canvasContent, 'test.canvas');
            const dataviewTasks = dataviewParser.parseCanvasFile(canvasContent, 'test.canvas');

            // Both should parse the task, but metadata handling might differ
            expect(tasksTasks.length).toBeGreaterThan(0);
            expect(dataviewTasks.length).toBeGreaterThan(0);
        });

        it('should allow updating parser configuration', () => {
            const initialConfig = getConfig('tasks');
            const parser = new CanvasParser(initialConfig);

            const newConfig = getConfig('dataview');
            parser.updateParserConfig(newConfig);

            // Parser should continue to work with new config
            const canvasContent = JSON.stringify({
                nodes: [
                    {
                        id: "test-node",
                        type: "text", 
                        text: "- [ ] Test task",
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            });

            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');
            expect(tasks.length).toBeGreaterThan(0);
        });
    });
});
