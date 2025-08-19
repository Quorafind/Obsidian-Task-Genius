/**
 * Tests for Canvas file parsing functionality
 */

import { CanvasParser } from '../parsers/canvas-parser';
import { CanvasData, CanvasTextData } from '../types/canvas';
import { getConfig } from '../common/task-parser-config';

describe('CanvasParser', () => {
    let parser: CanvasParser;

    beforeEach(() => {
        const config = getConfig('tasks');
        parser = new CanvasParser(config);
    });

    describe('parseCanvasFile', () => {
        it('should parse a simple canvas with text nodes containing tasks', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'text',
                        text: '- [ ] Task 1\n- [x] Task 2 completed',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    } as CanvasTextData,
                    {
                        id: 'node2',
                        type: 'text',
                        text: '- [ ] Another task\n- [ ] Yet another task',
                        x: 300,
                        y: 200,
                        width: 200,
                        height: 100
                    } as CanvasTextData
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');

            expect(tasks).toHaveLength(4);
            expect(tasks[0].content).toBe('Task 1');
            expect(tasks[0].completed).toBe(false);
            expect(tasks[1].content).toBe('Task 2 completed');
            expect(tasks[1].completed).toBe(true);
            expect(tasks[2].content).toBe('Another task');
            expect(tasks[3].content).toBe('Yet another task');
        });

        it('should handle canvas with no text nodes', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'file1',
                        type: 'file',
                        file: 'some-file.md',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');

            expect(tasks).toHaveLength(0);
        });

        it('should handle canvas with text nodes but no tasks', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'text',
                        text: 'This is just regular text\nNo tasks here',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    } as CanvasTextData
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');

            expect(tasks).toHaveLength(0);
        });

        it('should add canvas-specific metadata to tasks', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'text',
                        text: '- [ ] Task with metadata',
                        x: 100,
                        y: 200,
                        width: 300,
                        height: 150,
                        color: '#ff0000'
                    } as CanvasTextData
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');

            expect(tasks).toHaveLength(1);
            const task = tasks[0];
            expect((task.metadata as any).canvasNodeId).toBe('node1');
            expect((task.metadata as any).canvasPosition).toEqual({
                x: 100,
                y: 200,
                width: 300,
                height: 150
            });
            expect((task.metadata as any).canvasColor).toBe('#ff0000');
            expect((task.metadata as any).sourceType).toBe('canvas');
        });

        it('should handle invalid JSON gracefully', () => {
            const invalidJson = '{ invalid json }';
            const tasks = parser.parseCanvasFile(invalidJson, 'test.canvas');

            expect(tasks).toHaveLength(0);
        });

        it('should handle mixed node types', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'text1',
                        type: 'text',
                        text: '- [ ] Text node task',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    } as CanvasTextData,
                    {
                        id: 'file1',
                        type: 'file',
                        file: 'some-file.md',
                        x: 300,
                        y: 100,
                        width: 200,
                        height: 100
                    },
                    {
                        id: 'link1',
                        type: 'link',
                        url: 'https://example.com',
                        x: 500,
                        y: 100,
                        width: 200,
                        height: 100
                    },
                    {
                        id: 'text2',
                        type: 'text',
                        text: '- [x] Another text task',
                        x: 100,
                        y: 300,
                        width: 200,
                        height: 100
                    } as CanvasTextData
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const tasks = parser.parseCanvasFile(canvasContent, 'test.canvas');

            expect(tasks).toHaveLength(2);
            expect(tasks[0].content).toBe('Text node task');
            expect(tasks[0].completed).toBe(false);
            expect(tasks[1].content).toBe('Another text task');
            expect(tasks[1].completed).toBe(true);
        });
    });

    describe('isValidCanvasContent', () => {
        it('should validate correct canvas JSON', () => {
            const validCanvas = JSON.stringify({
                nodes: [],
                edges: []
            });

            expect(CanvasParser.isValidCanvasContent(validCanvas)).toBe(true);
        });

        it('should reject invalid JSON', () => {
            const invalidJson = '{ invalid }';
            expect(CanvasParser.isValidCanvasContent(invalidJson)).toBe(false);
        });

        it('should reject JSON without required properties', () => {
            const missingNodes = JSON.stringify({ edges: [] });
            const missingEdges = JSON.stringify({ nodes: [] });

            expect(CanvasParser.isValidCanvasContent(missingNodes)).toBe(false);
            expect(CanvasParser.isValidCanvasContent(missingEdges)).toBe(false);
        });
    });

    describe('extractTextOnly', () => {
        it('should extract text content from all text nodes', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'node1',
                        type: 'text',
                        text: 'First text node',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    } as CanvasTextData,
                    {
                        id: 'file1',
                        type: 'file',
                        file: 'some-file.md',
                        x: 300,
                        y: 100,
                        width: 200,
                        height: 100
                    },
                    {
                        id: 'node2',
                        type: 'text',
                        text: 'Second text node',
                        x: 100,
                        y: 300,
                        width: 200,
                        height: 100
                    } as CanvasTextData
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const textContent = parser.extractTextOnly(canvasContent);

            expect(textContent).toBe('First text node\n\nSecond text node');
        });

        it('should handle canvas with no text nodes', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'file1',
                        type: 'file',
                        file: 'some-file.md',
                        x: 100,
                        y: 100,
                        width: 200,
                        height: 100
                    }
                ],
                edges: []
            };

            const canvasContent = JSON.stringify(canvasData);
            const textContent = parser.extractTextOnly(canvasContent);

            expect(textContent).toBe('');
        });
    });
});
