/**
 * Simple validation script for the new parsing system
 * 
 * Tests basic functionality without complex TypeScript types
 */

const fs = require('fs');
const path = require('path');

class SimpleValidationTester {
    constructor() {
        this.results = [];
        this.basePath = path.join(__dirname, '..');
    }

    async runAllTests() {
        console.log('🔍 Starting Simple Validation Tests...\n');

        this.testFileStructure();
        this.testImportStructure();
        this.testCodeQuality();

        this.printSummary();
    }

    testFileStructure() {
        console.log('📁 Testing File Structure...');

        const expectedFiles = [
            'parsing/core/UnifiedCacheManager.ts',
            'parsing/core/ParseEventManager.ts',
            'parsing/core/ResourceManager.ts',
            'parsing/managers/UnifiedWorkerManager.ts',
            'parsing/events/ParseEvents.ts',
            'parsing/types/ParsingTypes.ts',
            'parsing/index.ts'
        ];

        const missingFiles = [];
        const presentFiles = [];

        expectedFiles.forEach(file => {
            const fullPath = path.join(this.basePath, file);
            if (fs.existsSync(fullPath)) {
                presentFiles.push(file);
            } else {
                missingFiles.push(file);
            }
        });

        this.results.push({
            test: 'File Structure',
            passed: missingFiles.length === 0,
            details: {
                present: presentFiles.length,
                missing: missingFiles.length,
                missingFiles: missingFiles
            }
        });

        console.log(`   ✓ Present files: ${presentFiles.length}`);
        if (missingFiles.length > 0) {
            console.log(`   ❌ Missing files: ${missingFiles.join(', ')}`);
        }
    }

    testImportStructure() {
        console.log('\n📦 Testing Import Structure...');

        const filesToCheck = [
            'parsing/core/UnifiedCacheManager.ts',
            'parsing/core/ParseEventManager.ts',
            'parsing/managers/UnifiedWorkerManager.ts'
        ];

        const importResults = [];

        filesToCheck.forEach(file => {
            const fullPath = path.join(this.basePath, file);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                
                const hasObsidianImports = content.includes("from 'obsidian'") || content.includes('from "obsidian"');
                const hasRelativeImports = content.includes("from '../");
                const hasClassDeclaration = content.includes('export class') || content.includes('class ');
                const hasJSDocComments = content.includes('/**');

                importResults.push({
                    file,
                    hasObsidianImports,
                    hasRelativeImports,
                    hasClassDeclaration,
                    hasJSDocComments,
                    lines: content.split('\n').length
                });
            }
        });

        const validFiles = importResults.filter(r => 
            r.hasObsidianImports && r.hasClassDeclaration
        ).length;

        this.results.push({
            test: 'Import Structure',
            passed: validFiles === filesToCheck.length,
            details: {
                validFiles,
                totalFiles: filesToCheck.length,
                results: importResults
            }
        });

        console.log(`   ✓ Valid files: ${validFiles}/${filesToCheck.length}`);
        importResults.forEach(r => {
            console.log(`     ${r.file}: ${r.lines} lines, ` +
                `${r.hasObsidianImports ? '✓' : '❌'} Obsidian, ` +
                `${r.hasClassDeclaration ? '✓' : '❌'} Class, ` +
                `${r.hasJSDocComments ? '✓' : '❌'} JSDoc`);
        });
    }

    testCodeQuality() {
        console.log('\n🔍 Testing Code Quality...');

        const filesToAnalyze = [
            'utils/TaskManager.ts',
            'parsing/core/UnifiedCacheManager.ts',
            'parsing/core/ParseEventManager.ts'
        ];

        const qualityResults = [];

        filesToAnalyze.forEach(file => {
            const fullPath = path.join(this.basePath, file);
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath, 'utf8');
                const lines = content.split('\n');
                
                const metrics = {
                    file,
                    totalLines: lines.length,
                    codeLines: lines.filter(line => 
                        line.trim() && 
                        !line.trim().startsWith('//') && 
                        !line.trim().startsWith('*') &&
                        !line.trim().startsWith('/*')
                    ).length,
                    commentLines: lines.filter(line => 
                        line.trim().startsWith('//') || 
                        line.trim().startsWith('*') ||
                        line.trim().startsWith('/*')
                    ).length,
                    methods: (content.match(/public\s+async?\s+\w+\(/g) || []).length +
                             (content.match(/private\s+async?\s+\w+\(/g) || []).length,
                    classes: (content.match(/export\s+class\s+\w+/g) || []).length,
                    imports: (content.match(/^import\s+.*from/gm) || []).length,
                    exports: (content.match(/^export\s+/gm) || []).length
                };

                metrics.commentRatio = metrics.commentLines / metrics.totalLines;
                qualityResults.push(metrics);
            }
        });

        const avgCommentRatio = qualityResults.reduce((sum, r) => sum + r.commentRatio, 0) / qualityResults.length;
        const totalMethods = qualityResults.reduce((sum, r) => sum + r.methods, 0);
        const totalLines = qualityResults.reduce((sum, r) => sum + r.totalLines, 0);

        this.results.push({
            test: 'Code Quality',
            passed: avgCommentRatio > 0.1 && totalMethods > 20, // At least 10% comments and 20+ methods
            details: {
                avgCommentRatio: (avgCommentRatio * 100).toFixed(1) + '%',
                totalMethods,
                totalLines,
                files: qualityResults
            }
        });

        console.log(`   ✓ Average comment ratio: ${(avgCommentRatio * 100).toFixed(1)}%`);
        console.log(`   ✓ Total methods: ${totalMethods}`);
        console.log(`   ✓ Total lines: ${totalLines}`);
        
        qualityResults.forEach(r => {
            console.log(`     ${r.file}: ${r.methods} methods, ${r.totalLines} lines, ${(r.commentRatio * 100).toFixed(1)}% comments`);
        });
    }

    printSummary() {
        console.log('\n📊 Validation Summary\n');
        console.log('=' * 60);
        
        const passed = this.results.filter(r => r.passed).length;
        const total = this.results.length;
        
        this.results.forEach(result => {
            const status = result.passed ? '✅ PASS' : '❌ FAIL';
            console.log(`${status} - ${result.test}`);
            
            if (!result.passed && result.details.missingFiles) {
                console.log(`      Missing: ${result.details.missingFiles.join(', ')}`);
            }
        });
        
        console.log('=' * 60);
        console.log(`\n🎯 Overall Result: ${passed}/${total} tests passed`);
        
        if (passed === total) {
            console.log('✅ All validation tests passed! The new parsing system structure is ready.');
        } else {
            console.log('❌ Some validation tests failed. Please check the issues above.');
        }

        // Additional insights
        const totalLines = this.results
            .find(r => r.test === 'Code Quality')?.details.totalLines || 0;
        const totalMethods = this.results
            .find(r => r.test === 'Code Quality')?.details.totalMethods || 0;

        if (totalLines > 0) {
            console.log(`\n📈 Code Statistics:`);
            console.log(`   Total lines of code: ${totalLines}`);
            console.log(`   Total methods: ${totalMethods}`);
            console.log(`   Average methods per file: ${(totalMethods / 3).toFixed(1)}`);
        }

        console.log('\n🏁 Validation completed!');
    }
}

// Run validation if this file is executed directly
if (require.main === module) {
    const tester = new SimpleValidationTester();
    tester.runAllTests().catch(error => {
        console.error('Fatal error during validation:', error);
        process.exit(1);
    });
}

module.exports = { SimpleValidationTester };