/**
 * Tests for Canvas file monitoring functionality
 * This test verifies that Canvas files are properly monitored for changes
 */

import { TFile } from 'obsidian';
import { isSupportedFile, isCanvasFile } from '../utils/file/file-type-detector';
import { CanvasData } from '../types/canvas';

// Mock TFile for testing
class MockTFile {
    constructor(
        public path: string, 
        public extension: string,
        public stat: { mtime: number } = { mtime: Date.now() }
    ) {}

    get name() {
        return this.path.split('/').pop() || '';
    }
}

// Mock Vault for file monitoring tests
class MockVault {
    private files: Map<string, string> = new Map();
    private eventListeners: Map<string, Function[]> = new Map();

    getFiles(): TFile[] {
        return Array.from(this.files.keys()).map(path => {
            const extension = path.split('.').pop() || '';
            return new MockTFile(path, extension) as any;
        });
    }

    getFileByPath(path: string): TFile | null {
        if (this.files.has(path)) {
            const extension = path.split('.').pop() || '';
            return new MockTFile(path, extension) as any;
        }
        return null;
    }

    async read(file: TFile): Promise<string> {
        return this.files.get(file.path) || '';
    }

    async modify(file: TFile, content: string): Promise<void> {
        this.files.set(file.path, content);
        this.triggerEvent('modify', file);
    }

    setFileContent(path: string, content: string): void {
        this.files.set(path, content);
    }

    getFileContent(path: string): string | undefined {
        return this.files.get(path);
    }

    // Mock event system
    on(eventName: string, callback: Function): any {
        if (!this.eventListeners.has(eventName)) {
            this.eventListeners.set(eventName, []);
        }
        this.eventListeners.get(eventName)!.push(callback);
        return { unload: () => {} }; // Mock event reference
    }

    private triggerEvent(eventName: string, ...args: any[]): void {
        const listeners = this.eventListeners.get(eventName) || [];
        listeners.forEach(listener => listener(...args));
    }

    // Simulate file creation
    createFile(path: string, content: string): TFile {
        this.setFileContent(path, content);
        const extension = path.split('.').pop() || '';
        const file = new MockTFile(path, extension) as any;
        this.triggerEvent('create', file);
        return file;
    }

    // Simulate file deletion
    deleteFile(path: string): void {
        const extension = path.split('.').pop() || '';
        const file = new MockTFile(path, extension) as any;
        this.files.delete(path);
        this.triggerEvent('delete', file);
    }
}

describe('Canvas File Monitoring', () => {
    let mockVault: MockVault;
    let modifyEventTriggered: boolean;
    let createEventTriggered: boolean;
    let deleteEventTriggered: boolean;
    let lastModifiedFile: TFile | null;

    beforeEach(() => {
        mockVault = new MockVault();
        modifyEventTriggered = false;
        createEventTriggered = false;
        deleteEventTriggered = false;
        lastModifiedFile = null;

        // Set up event listeners to track events
        mockVault.on('modify', (file: TFile) => {
            if (isSupportedFile(file)) {
                modifyEventTriggered = true;
                lastModifiedFile = file;
            }
        });

        mockVault.on('create', (file: TFile) => {
            if (isSupportedFile(file)) {
                createEventTriggered = true;
            }
        });

        mockVault.on('delete', (file: TFile) => {
            if (isSupportedFile(file)) {
                deleteEventTriggered = true;
            }
        });
    });

    describe('File Type Detection for Monitoring', () => {
        it('should correctly identify Canvas files as supported for monitoring', () => {
            const canvasFile = new MockTFile('test.canvas', 'canvas') as any;
            expect(isSupportedFile(canvasFile)).toBe(true);
            expect(isCanvasFile(canvasFile)).toBe(true);
        });

        it('should correctly identify markdown files as supported for monitoring', () => {
            const mdFile = new MockTFile('test.md', 'md') as any;
            expect(isSupportedFile(mdFile)).toBe(true);
            expect(isCanvasFile(mdFile)).toBe(false);
        });

        it('should reject unsupported file types for monitoring', () => {
            const txtFile = new MockTFile('test.txt', 'txt') as any;
            expect(isSupportedFile(txtFile)).toBe(false);
        });
    });

    describe('Canvas File Modification Events', () => {
        it('should trigger modify event when Canvas file is changed', async () => {
            // Create a Canvas file
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'test-node',
                        type: 'text',
                        text: '# Test\n\n- [ ] Original task',
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200
                    }
                ],
                edges: []
            };

            const canvasFile = mockVault.createFile('test.canvas', JSON.stringify(canvasData, null, 2));
            
            // Reset event flags
            modifyEventTriggered = false;
            lastModifiedFile = null;

            // Modify the Canvas file
            const updatedCanvasData = {
                ...canvasData,
                nodes: [
                    {
                        ...canvasData.nodes[0],
                        text: '# Test\n\n- [x] Original task'
                    }
                ]
            };

            await mockVault.modify(canvasFile, JSON.stringify(updatedCanvasData, null, 2));

            // Verify that the modify event was triggered
            expect(modifyEventTriggered).toBe(true);
            expect(lastModifiedFile).toBeTruthy();
            expect((lastModifiedFile as any).path).toBe('test.canvas');
        });

        it('should trigger create event when new Canvas file is created', () => {
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'new-node',
                        type: 'text',
                        text: '# New Canvas\n\n- [ ] New task',
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200
                    }
                ],
                edges: []
            };

            mockVault.createFile('new.canvas', JSON.stringify(canvasData, null, 2));

            expect(createEventTriggered).toBe(true);
        });

        it('should trigger delete event when Canvas file is deleted', () => {
            // First create a Canvas file
            const canvasData: CanvasData = {
                nodes: [
                    {
                        id: 'delete-node',
                        type: 'text',
                        text: '# To Delete\n\n- [ ] Task to delete',
                        x: 100,
                        y: 100,
                        width: 300,
                        height: 200
                    }
                ],
                edges: []
            };

            mockVault.createFile('delete.canvas', JSON.stringify(canvasData, null, 2));
            
            // Reset event flags
            deleteEventTriggered = false;

            // Delete the file
            mockVault.deleteFile('delete.canvas');

            expect(deleteEventTriggered).toBe(true);
        });
    });

    describe('Mixed File Type Monitoring', () => {
        it('should handle both Canvas and Markdown files in monitoring', () => {
            let canvasEventTriggered = false;
            let markdownEventTriggered = false;

            // Set up specific listeners for different file types
            mockVault.on('modify', (file: TFile) => {
                if (isCanvasFile(file)) {
                    canvasEventTriggered = true;
                } else if (file.extension === 'md') {
                    markdownEventTriggered = true;
                }
            });

            // Create and modify Canvas file
            const canvasFile = mockVault.createFile('mixed.canvas', JSON.stringify({
                nodes: [{ id: 'test', type: 'text', text: '- [ ] Canvas task', x: 0, y: 0, width: 100, height: 100 }],
                edges: []
            }, null, 2));

            // Create and modify Markdown file
            const mdFile = mockVault.createFile('mixed.md', '# Test\n\n- [ ] Markdown task');

            // Reset flags
            canvasEventTriggered = false;
            markdownEventTriggered = false;

            // Modify both files
            mockVault.modify(canvasFile, JSON.stringify({
                nodes: [{ id: 'test', type: 'text', text: '- [x] Canvas task', x: 0, y: 0, width: 100, height: 100 }],
                edges: []
            }, null, 2));

            mockVault.modify(mdFile, '# Test\n\n- [x] Markdown task');

            expect(canvasEventTriggered).toBe(true);
            expect(markdownEventTriggered).toBe(true);
        });
    });
});
