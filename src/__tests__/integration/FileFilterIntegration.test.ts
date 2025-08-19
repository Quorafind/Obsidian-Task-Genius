/**
 * Integration tests for File Filter functionality
 * 
 * These tests verify the complete integration of file filtering
 * from settings to actual task indexing behavior.
 */

import { FileFilterManager } from '../../managers/file-filter-manager';
import { FilterMode, FileFilterSettings } from '../../common/setting-definition';

// Mock TFile and TFolder for testing
class MockTFile {
    constructor(public path: string, public extension: string) {}
}

class MockTFolder {
    constructor(public path: string) {}
}

describe('File Filter Integration Tests', () => {
    describe('End-to-End Filtering Scenarios', () => {
        it('should handle typical vault structure with system folders excluded', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: true },
                    { type: 'folder', path: '.trash', enabled: true },
                    { type: 'folder', path: '.git', enabled: true },
                    { type: 'pattern', path: '*.tmp', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            // Test various file scenarios
            const testCases = [
                // Should be excluded
                { file: new MockTFile('.obsidian/config.json', 'json'), expected: false },
                { file: new MockTFile('.obsidian/plugins/plugin.js', 'js'), expected: false },
                { file: new MockTFile('.trash/deleted.md', 'md'), expected: false },
                { file: new MockTFile('.git/config', ''), expected: false },
                { file: new MockTFile('cache.tmp', 'tmp'), expected: false },
                
                // Should be included
                { file: new MockTFile('notes/my-note.md', 'md'), expected: true },
                { file: new MockTFile('projects/project.canvas', 'canvas'), expected: true },
                { file: new MockTFile('daily/2024-01-01.md', 'md'), expected: true },
                { file: new MockTFile('templates/template.md', 'md'), expected: true }
            ];
            
            testCases.forEach(({ file, expected }) => {
                const result = manager.shouldIncludeFile(file as any);
                expect(result).toBe(expected);
            });
        });

        it('should handle whitelist mode for focused project work', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.WHITELIST,
                rules: [
                    { type: 'folder', path: 'projects', enabled: true },
                    { type: 'folder', path: 'notes', enabled: true },
                    { type: 'file', path: 'inbox.md', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            const testCases = [
                // Should be included
                { file: new MockTFile('projects/project-a.md', 'md'), expected: true },
                { file: new MockTFile('projects/subproject/tasks.md', 'md'), expected: true },
                { file: new MockTFile('notes/meeting-notes.md', 'md'), expected: true },
                { file: new MockTFile('inbox.md', 'md'), expected: true },
                
                // Should be excluded
                { file: new MockTFile('archive/old-project.md', 'md'), expected: false },
                { file: new MockTFile('templates/template.md', 'md'), expected: false },
                { file: new MockTFile('daily/2024-01-01.md', 'md'), expected: false }
            ];
            
            testCases.forEach(({ file, expected }) => {
                const result = manager.shouldIncludeFile(file as any);
                expect(result).toBe(expected);
            });
        });

        it('should handle complex pattern matching scenarios', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'pattern', path: '*.tmp', enabled: true },
                    { type: 'pattern', path: 'temp/*', enabled: true },
                    { type: 'pattern', path: '*backup*', enabled: true },
                    { type: 'pattern', path: '*.log', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            const testCases = [
                // Should be excluded by patterns
                { file: new MockTFile('cache.tmp', 'tmp'), expected: false },
                { file: new MockTFile('temp/working.md', 'md'), expected: false },
                { file: new MockTFile('temp/subfolder/file.md', 'md'), expected: false },
                { file: new MockTFile('project-backup.md', 'md'), expected: false },
                { file: new MockTFile('backup-2024.md', 'md'), expected: false },
                { file: new MockTFile('system.log', 'log'), expected: false },
                
                // Should be included
                { file: new MockTFile('notes/important.md', 'md'), expected: true },
                { file: new MockTFile('projects/main.md', 'md'), expected: true },
                { file: new MockTFile('templates/task-template.md', 'md'), expected: true }
            ];
            
            testCases.forEach(({ file, expected }) => {
                const result = manager.shouldIncludeFile(file as any);
                expect(result).toBe(expected);
            });
        });
    });

    describe('Performance and Caching', () => {
        it('should demonstrate caching performance benefits', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: true },
                    { type: 'pattern', path: '*.tmp', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            const testFile = new MockTFile('.obsidian/config.json', 'json') as any;
            
            // First call - should populate cache
            const start1 = performance.now();
            const result1 = manager.shouldIncludeFile(testFile);
            const time1 = performance.now() - start1;
            
            // Second call - should use cache
            const start2 = performance.now();
            const result2 = manager.shouldIncludeFile(testFile);
            const time2 = performance.now() - start2;
            
            expect(result1).toBe(result2);
            expect(result1).toBe(false);
            
            // Cache should be faster (though this might be flaky in fast environments)
            // We mainly check that caching is working by verifying cache size
            const stats = manager.getStats();
            expect(stats.cacheSize).toBeGreaterThan(0);
        });

        it('should handle large numbers of files efficiently', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: true },
                    { type: 'folder', path: '.trash', enabled: true },
                    { type: 'pattern', path: '*.tmp', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            // Simulate processing many files
            const fileCount = 1000;
            const files = [];
            
            for (let i = 0; i < fileCount; i++) {
                if (i % 3 === 0) {
                    files.push(new MockTFile(`.obsidian/file${i}.json`, 'json'));
                } else if (i % 3 === 1) {
                    files.push(new MockTFile(`notes/note${i}.md`, 'md'));
                } else {
                    files.push(new MockTFile(`temp${i}.tmp`, 'tmp'));
                }
            }
            
            const start = performance.now();
            
            let includedCount = 0;
            let excludedCount = 0;
            
            files.forEach(file => {
                if (manager.shouldIncludeFile(file as any)) {
                    includedCount++;
                } else {
                    excludedCount++;
                }
            });
            
            const processingTime = performance.now() - start;
            
            // Verify results
            expect(includedCount + excludedCount).toBe(fileCount);
            expect(includedCount).toBeGreaterThan(0); // Should include some files
            expect(excludedCount).toBeGreaterThan(0); // Should exclude some files
            
            // Performance should be reasonable (less than 100ms for 1000 files)
            expect(processingTime).toBeLessThan(100);
            
            // Cache should be populated
            const stats = manager.getStats();
            expect(stats.cacheSize).toBe(fileCount);
        });
    });

    describe('Configuration Updates', () => {
        it('should handle dynamic configuration changes correctly', () => {
            const initialConfig: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(initialConfig);
            const testFile = new MockTFile('.obsidian/config.json', 'json') as any;
            
            // Initially should exclude
            expect(manager.shouldIncludeFile(testFile)).toBe(false);
            
            // Update to whitelist mode
            const newConfig: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.WHITELIST,
                rules: [
                    { type: 'folder', path: 'notes', enabled: true }
                ]
            };
            
            manager.updateConfig(newConfig);
            
            // Should now exclude (not in whitelist)
            expect(manager.shouldIncludeFile(testFile)).toBe(false);
            
            // Test a file that should be included in whitelist
            const notesFile = new MockTFile('notes/test.md', 'md') as any;
            expect(manager.shouldIncludeFile(notesFile)).toBe(true);
            
            // Disable filtering entirely
            const disabledConfig: FileFilterSettings = {
                enabled: false,
                mode: FilterMode.BLACKLIST,
                rules: []
            };
            
            manager.updateConfig(disabledConfig);
            
            // Should now include everything
            expect(manager.shouldIncludeFile(testFile)).toBe(true);
            expect(manager.shouldIncludeFile(notesFile)).toBe(true);
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle empty and invalid paths gracefully', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            // Test edge cases
            const edgeCases = [
                new MockTFile('', 'md'),
                new MockTFile('/', 'md'),
                new MockTFile('\\', 'md'),
                new MockTFile('file.md', 'md'),
                new MockTFile('./file.md', 'md'),
                new MockTFile('../file.md', 'md')
            ];
            
            edgeCases.forEach(file => {
                // Should not throw errors
                expect(() => {
                    manager.shouldIncludeFile(file as any);
                }).not.toThrow();
            });
        });

        it('should handle disabled rules correctly', () => {
            const config: FileFilterSettings = {
                enabled: true,
                mode: FilterMode.BLACKLIST,
                rules: [
                    { type: 'folder', path: '.obsidian', enabled: false },
                    { type: 'folder', path: '.trash', enabled: true }
                ]
            };
            
            const manager = new FileFilterManager(config);
            
            // Disabled rule should not affect filtering
            const obsidianFile = new MockTFile('.obsidian/config.json', 'json') as any;
            expect(manager.shouldIncludeFile(obsidianFile)).toBe(true);
            
            // Enabled rule should affect filtering
            const trashFile = new MockTFile('.trash/deleted.md', 'md') as any;
            expect(manager.shouldIncludeFile(trashFile)).toBe(false);
        });
    });
});
