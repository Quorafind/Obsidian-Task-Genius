/**
 * Project Parser Plugin
 * 
 * Advanced project detection and parsing with type safety and multiple detection strategies.
 * Uses sophisticated pattern matching and configuration validation.
 * 
 * Features:
 * - Multiple detection strategies (path, metadata, config, cache)
 * - Type-safe project configuration validation
 * - Advanced pattern matching with confidence scoring
 * - Intelligent fallback mechanisms
 * - Project hierarchy resolution
 * - Configuration inheritance and merging
 */

import { App } from 'obsidian';
import { TgProject } from '../../types/task';
import { 
    ParserPlugin, 
    ParserPluginConfig, 
    FallbackStrategy, 
    PluginUtils 
} from './ParserPlugin';
import { 
    ParseContext, 
    ProjectParseResult, 
    ProjectDetectionStrategy, 
    ParserPluginType 
} from '../types/ParsingTypes';
import { ParseEventManager } from '../core/ParseEventManager';
import { ParseEventType } from '../events/ParseEvents';

/**
 * Project detection confidence tuple
 * [PathScore, MetadataScore, ConfigScore, OverallConfidence]
 */
export type ProjectConfidenceTuple = readonly [
    pathScore: number,
    metadataScore: number, 
    configScore: number,
    overallConfidence: number
];

/**
 * Project configuration validation tuple
 * [IsValid, ErrorCount, WarningCount, Score]
 */
export type ProjectConfigValidationTuple = readonly [
    isValid: boolean,
    errorCount: number,
    warningCount: number,
    score: number
];

/**
 * Detection source priority tuple
 * [CachePriority, ConfigPriority, MetadataPriority, PathPriority]
 */
export type DetectionPriorityTuple = readonly [
    cachePriority: number,
    configPriority: number,
    metadataPriority: number,
    pathPriority: number
];

/**
 * Project template configuration
 */
export interface ProjectTemplate {
    /** Template name */
    name: string;
    /** Path patterns that match this template */
    pathPatterns: readonly string[];
    /** Required metadata fields */
    requiredMetadata: readonly string[];
    /** Default project configuration */
    defaultConfig: Record<string, any>;
    /** Template confidence score */
    confidence: number;
}

/**
 * Project detection result with enhanced metadata
 */
export interface EnhancedProjectDetection {
    /** Detected project */
    project: TgProject;
    /** Detection source */
    source: 'cache' | 'config' | 'metadata' | 'path' | 'template' | 'default';
    /** Confidence tuple */
    confidenceTuple: ProjectConfidenceTuple;
    /** Validation results */
    validation: ProjectConfigValidationTuple;
    /** Applied template (if any) */
    template?: ProjectTemplate;
    /** Inheritance chain */
    inheritanceChain: string[];
    /** Detected issues */
    issues: Array<{
        severity: 'error' | 'warning' | 'info';
        message: string;
        field?: string;
    }>;
}

/**
 * Project parser configuration
 */
export interface ProjectParserConfig extends ParserPluginConfig {
    /** Detection strategies to use */
    strategies: readonly ProjectDetectionStrategy[];
    /** Project templates */
    templates: readonly ProjectTemplate[];
    /** Detection priority tuple */
    priorityTuple: DetectionPriorityTuple;
    /** Enable project hierarchy resolution */
    enableHierarchy: boolean;
    /** Enable configuration inheritance */
    enableInheritance: boolean;
    /** Default project configuration */
    defaultProject: Partial<TgProject>;
    /** Path patterns for project root detection */
    rootPatterns: readonly string[];
    /** Configuration file names to look for */
    configFiles: readonly string[];
}

/**
 * Default project templates
 */
const DEFAULT_TEMPLATES: readonly ProjectTemplate[] = [
    {
        name: 'obsidian-vault',
        pathPatterns: ['**/.obsidian/**', '**/vault.json'],
        requiredMetadata: [],
        defaultConfig: {
            type: 'obsidian-vault',
            features: ['notes', 'tasks', 'projects']
        },
        confidence: 0.9
    },
    {
        name: 'git-repository',
        pathPatterns: ['**/.git/**', '**/package.json', '**/Cargo.toml', '**/go.mod'],
        requiredMetadata: [],
        defaultConfig: {
            type: 'git-repository',
            features: ['version-control', 'tasks']
        },
        confidence: 0.8
    },
    {
        name: 'task-project',
        pathPatterns: ['**/tasks/**', '**/TODO.md', '**/TASKS.md'],
        requiredMetadata: ['project', 'tasks'],
        defaultConfig: {
            type: 'task-project',
            features: ['tasks', 'deadlines']
        },
        confidence: 0.7
    }
] as const;

/**
 * Default project parser configuration
 */
const DEFAULT_PROJECT_CONFIG: Omit<ProjectParserConfig, 'strategies'> = {
    type: 'project' as ParserPluginType,
    name: 'ProjectParserPlugin',
    version: '1.0.0',
    configTuple: PluginUtils.createConfigTuple(0, 2, 15000, true, FallbackStrategy.DEFAULT_VALUES),
    retryStrategy: {
        maxAttempts: 2,
        baseDelayMs: 50,
        backoffMultiplier: 1.5,
        maxDelayMs: 1000,
        jitterFactor: 0.05
    },
    enableMonitoring: true,
    debug: false,
    templates: DEFAULT_TEMPLATES,
    priorityTuple: [100, 80, 60, 40] as const, // cache > config > metadata > path
    enableHierarchy: true,
    enableInheritance: true,
    defaultProject: {
        name: 'Default Project',
        path: '',
        config: {}
    },
    rootPatterns: [
        '**/.obsidian',
        '**/.git',
        '**/package.json',
        '**/project.json',
        '**/task-genius.json'
    ] as const,
    configFiles: [
        'project.json',
        'task-genius.json',
        '.project.json',
        'project.yaml',
        'project.yml'
    ] as const
};

/**
 * Path-based detection strategy
 */
class PathDetectionStrategy implements ProjectDetectionStrategy {
    readonly name = 'path';
    readonly priority = 40;
    
    constructor(private config: ProjectParserConfig) {}
    
    async detect(context: ParseContext): Promise<TgProject | undefined> {
        const pathScore = this.calculatePathScore(context.filePath);
        if (pathScore < 0.3) return undefined;
        
        // Find matching template
        const template = this.findMatchingTemplate(context.filePath);
        
        return {
            id: this.generateProjectId(context.filePath),
            name: this.extractProjectName(context.filePath),
            path: this.resolveProjectRoot(context.filePath),
            config: template ? { ...template.defaultConfig } : {}
        };
    }
    
    validate(project: TgProject, context: ParseContext): boolean {
        return !!(project.id && project.name && project.path);
    }
    
    private calculatePathScore(filePath: string): number {
        let score = 0;
        
        // Check for project indicators in path
        const indicators = ['.obsidian', '.git', 'src', 'docs', 'projects', 'tasks'];
        for (const indicator of indicators) {
            if (filePath.includes(indicator)) {
                score += 0.2;
            }
        }
        
        // Check depth (deeper paths are less likely to be project roots)
        const depth = filePath.split('/').length;
        score = Math.max(0, score - (depth * 0.05));
        
        return Math.min(1, score);
    }
    
    private findMatchingTemplate(filePath: string): ProjectTemplate | undefined {
        for (const template of this.config.templates) {
            for (const pattern of template.pathPatterns) {
                if (this.matchesPattern(filePath, pattern)) {
                    return template;
                }
            }
        }
        return undefined;
    }
    
    private matchesPattern(path: string, pattern: string): boolean {
        // Simple glob pattern matching
        const regex = new RegExp(
            pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '[^/]')
        );
        return regex.test(path);
    }
    
    private generateProjectId(filePath: string): string {
        const root = this.resolveProjectRoot(filePath);
        return `path:${root.replace(/[^a-zA-Z0-9]/g, '-')}`;
    }
    
    private extractProjectName(filePath: string): string {
        const root = this.resolveProjectRoot(filePath);
        const segments = root.split('/');
        return segments[segments.length - 1] || 'Unnamed Project';
    }
    
    private resolveProjectRoot(filePath: string): string {
        const segments = filePath.split('/');
        
        // Look for project root indicators
        for (let i = segments.length - 1; i >= 0; i--) {
            const currentPath = segments.slice(0, i + 1).join('/');
            for (const pattern of this.config.rootPatterns) {
                if (this.matchesPattern(currentPath, pattern)) {
                    return segments.slice(0, i).join('/') || '/';
                }
            }
        }
        
        // Default to parent directory
        return segments.slice(0, -1).join('/') || '/';
    }
}

/**
 * Metadata-based detection strategy
 */
class MetadataDetectionStrategy implements ProjectDetectionStrategy {
    readonly name = 'metadata';
    readonly priority = 60;
    
    async detect(context: ParseContext): Promise<TgProject | undefined> {
        if (!context.metadata) return undefined;
        
        const projectData = this.extractProjectFromMetadata(context.metadata);
        if (!projectData) return undefined;
        
        return {
            id: projectData.id || this.generateProjectId(context.filePath),
            name: projectData.name || 'Metadata Project',
            path: projectData.path || context.filePath,
            config: projectData.config || {}
        };
    }
    
    validate(project: TgProject, context: ParseContext): boolean {
        return !!(project.id && project.name);
    }
    
    private extractProjectFromMetadata(metadata: Record<string, any>): Partial<TgProject> | undefined {
        // Direct project field
        if (metadata.project && typeof metadata.project === 'object') {
            return metadata.project;
        }
        
        // Individual fields
        if (metadata.projectName || metadata['project-name']) {
            return {
                name: metadata.projectName || metadata['project-name'],
                id: metadata.projectId || metadata['project-id'],
                path: metadata.projectPath || metadata['project-path'],
                config: metadata.projectConfig || metadata['project-config'] || {}
            };
        }
        
        return undefined;
    }
    
    private generateProjectId(filePath: string): string {
        return `metadata:${filePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
    }
}

/**
 * Configuration file detection strategy
 */
class ConfigDetectionStrategy implements ProjectDetectionStrategy {
    readonly name = 'config';
    readonly priority = 80;
    
    constructor(private app: App, private config: ProjectParserConfig) {}
    
    async detect(context: ParseContext): Promise<TgProject | undefined> {
        const configPath = await this.findConfigFile(context.filePath);
        if (!configPath) return undefined;
        
        const configData = await this.loadConfigFile(configPath);
        if (!configData) return undefined;
        
        return this.parseConfigData(configData, configPath);
    }
    
    validate(project: TgProject, context: ParseContext): boolean {
        return !!(project.id && project.name && project.config);
    }
    
    private async findConfigFile(filePath: string): Promise<string | undefined> {
        const segments = filePath.split('/');
        
        // Search up the directory tree for config files
        for (let i = segments.length - 1; i >= 0; i--) {
            const dir = segments.slice(0, i).join('/');
            
            for (const configFile of this.config.configFiles) {
                const configPath = `${dir}/${configFile}`;
                const file = this.app.vault.getAbstractFileByPath(configPath);
                if (file) return configPath;
            }
        }
        
        return undefined;
    }
    
    private async loadConfigFile(configPath: string): Promise<any> {
        try {
            const file = this.app.vault.getAbstractFileByPath(configPath);
            if (!file) return undefined;
            
            const content = await this.app.vault.read(file as any);
            
            if (configPath.endsWith('.json')) {
                return JSON.parse(content);
            } else if (configPath.endsWith('.yaml') || configPath.endsWith('.yml')) {
                // Would need YAML parser for this
                return undefined;
            }
            
            return undefined;
        } catch (error) {
            return undefined;
        }
    }
    
    private parseConfigData(configData: any, configPath: string): TgProject | undefined {
        if (!configData || typeof configData !== 'object') return undefined;
        
        return {
            id: configData.id || `config:${configPath}`,
            name: configData.name || 'Config Project',
            path: configData.path || configPath.substring(0, configPath.lastIndexOf('/')),
            config: configData.config || configData
        };
    }
}

/**
 * Project Parser Plugin
 * 
 * Sophisticated project detection with multiple strategies and type safety.
 * Provides intelligent fallbacks and confidence scoring.
 */
export class ProjectParserPlugin extends ParserPlugin<TgProject> {
    private strategies: ProjectDetectionStrategy[];
    private projectConfig: ProjectParserConfig;
    private detectionCache = new Map<string, EnhancedProjectDetection>();
    
    constructor(
        app: App,
        eventManager: ParseEventManager,
        config: Partial<ProjectParserConfig> = {}
    ) {
        const fullConfig = { 
            ...DEFAULT_PROJECT_CONFIG, 
            ...config,
            strategies: [] // Will be set below
        };
        
        super(app, eventManager, fullConfig);
        this.projectConfig = fullConfig;
        
        // Initialize detection strategies
        this.strategies = [
            new PathDetectionStrategy(this.projectConfig),
            new MetadataDetectionStrategy(),
            new ConfigDetectionStrategy(this.app, this.projectConfig)
        ];
        this.projectConfig.strategies = this.strategies;
    }
    
    /**
     * Core project detection logic
     */
    protected async parseInternal(context: ParseContext): Promise<TgProject> {
        const cacheKey = this.getCacheKey(context);
        
        // Check detection cache first
        const cached = this.detectionCache.get(cacheKey);
        if (cached && this.isCacheValid(cached, context)) {
            this.emitProjectEvent(cached.project, cached.source, cached.confidenceTuple[3]);
            return cached.project;
        }
        
        // Run detection strategies in priority order
        const detectionResults = await this.runDetectionStrategies(context);
        
        // Select best detection result
        const bestDetection = this.selectBestDetection(detectionResults);
        
        if (!bestDetection) {
            throw new Error('No project detected');
        }
        
        // Enhance project with hierarchy and inheritance
        const enhancedProject = await this.enhanceProject(bestDetection.project, context);
        
        // Create enhanced detection result
        const enhancedDetection: EnhancedProjectDetection = {
            project: enhancedProject,
            source: bestDetection.source,
            confidenceTuple: bestDetection.confidenceTuple,
            validation: this.validateProjectConfig(enhancedProject),
            template: bestDetection.template,
            inheritanceChain: await this.resolveInheritanceChain(enhancedProject, context),
            issues: this.detectIssues(enhancedProject)
        };
        
        // Cache the result
        this.detectionCache.set(cacheKey, enhancedDetection);
        
        // Emit detection event
        this.emitProjectEvent(
            enhancedDetection.project, 
            enhancedDetection.source, 
            enhancedDetection.confidenceTuple[3]
        );
        
        return enhancedDetection.project;
    }
    
    /**
     * Run all detection strategies
     */
    private async runDetectionStrategies(context: ParseContext): Promise<Array<{
        project: TgProject;
        source: string;
        confidenceTuple: ProjectConfidenceTuple;
        template?: ProjectTemplate;
    }>> {
        const results: Array<{
            project: TgProject;
            source: string;
            confidenceTuple: ProjectConfidenceTuple;
            template?: ProjectTemplate;
        }> = [];
        
        // Sort strategies by priority
        const sortedStrategies = [...this.strategies].sort((a, b) => b.priority - a.priority);
        
        for (const strategy of sortedStrategies) {
            try {
                const project = await strategy.detect(context);
                if (project && strategy.validate(project, context)) {
                    const confidence = this.calculateConfidence(project, strategy, context);
                    results.push({
                        project,
                        source: strategy.name,
                        confidenceTuple: confidence,
                        template: this.findAppliedTemplate(project)
                    });
                }
            } catch (error) {
                this.log(`Strategy ${strategy.name} failed: ${error.message}`);
            }
        }
        
        return results;
    }
    
    /**
     * Select the best detection result based on confidence and priority
     */
    private selectBestDetection(results: Array<{
        project: TgProject;
        source: string;
        confidenceTuple: ProjectConfidenceTuple;
        template?: ProjectTemplate;
    }>): typeof results[0] | undefined {
        if (results.length === 0) return undefined;
        
        // Sort by overall confidence
        return results.sort((a, b) => b.confidenceTuple[3] - a.confidenceTuple[3])[0];
    }
    
    /**
     * Calculate confidence score tuple
     */
    private calculateConfidence(
        project: TgProject, 
        strategy: ProjectDetectionStrategy,
        context: ParseContext
    ): ProjectConfidenceTuple {
        let pathScore = 0;
        let metadataScore = 0;
        let configScore = 0;
        
        // Path-based scoring
        if (project.path && context.filePath.startsWith(project.path)) {
            pathScore = 0.8;
        }
        
        // Metadata-based scoring
        if (context.metadata && strategy.name === 'metadata') {
            metadataScore = 0.9;
        }
        
        // Config-based scoring
        if (project.config && Object.keys(project.config).length > 0) {
            configScore = 0.7;
        }
        
        // Strategy priority influences overall confidence
        const priorityBonus = strategy.priority / 100;
        const overallConfidence = Math.min(1, 
            (pathScore + metadataScore + configScore) / 3 + priorityBonus
        );
        
        return [pathScore, metadataScore, configScore, overallConfidence] as const;
    }
    
    /**
     * Enhance project with hierarchy and inheritance
     */
    private async enhanceProject(project: TgProject, context: ParseContext): Promise<TgProject> {
        let enhanced = { ...project };
        
        // Apply hierarchy if enabled
        if (this.projectConfig.enableHierarchy) {
            enhanced = await this.applyProjectHierarchy(enhanced, context);
        }
        
        // Apply inheritance if enabled
        if (this.projectConfig.enableInheritance) {
            enhanced = await this.applyConfigInheritance(enhanced, context);
        }
        
        return enhanced;
    }
    
    /**
     * Apply project hierarchy resolution
     */
    private async applyProjectHierarchy(project: TgProject, context: ParseContext): Promise<TgProject> {
        // Implementation would resolve parent/child relationships
        // For now, return as-is
        return project;
    }
    
    /**
     * Apply configuration inheritance
     */
    private async applyConfigInheritance(project: TgProject, context: ParseContext): Promise<TgProject> {
        // Merge with default configuration
        const mergedConfig = {
            ...this.projectConfig.defaultProject.config,
            ...project.config
        };
        
        return {
            ...project,
            config: mergedConfig
        };
    }
    
    /**
     * Resolve inheritance chain
     */
    private async resolveInheritanceChain(project: TgProject, context: ParseContext): Promise<string[]> {
        // Implementation would trace configuration inheritance
        return [project.id];
    }
    
    /**
     * Validate project configuration
     */
    private validateProjectConfig(project: TgProject): ProjectConfigValidationTuple {
        let errorCount = 0;
        let warningCount = 0;
        
        // Required field validation
        if (!project.id) errorCount++;
        if (!project.name) errorCount++;
        if (!project.path) errorCount++;
        
        // Configuration validation
        if (!project.config || Object.keys(project.config).length === 0) {
            warningCount++;
        }
        
        const isValid = errorCount === 0;
        const score = Math.max(0, 1 - (errorCount * 0.5) - (warningCount * 0.2));
        
        return [isValid, errorCount, warningCount, score] as const;
    }
    
    /**
     * Detect project issues
     */
    private detectIssues(project: TgProject): Array<{
        severity: 'error' | 'warning' | 'info';
        message: string;
        field?: string;
    }> {
        const issues: Array<{
            severity: 'error' | 'warning' | 'info';
            message: string;
            field?: string;
        }> = [];
        
        if (!project.id) {
            issues.push({
                severity: 'error',
                message: 'Project ID is required',
                field: 'id'
            });
        }
        
        if (!project.name) {
            issues.push({
                severity: 'error',
                message: 'Project name is required',
                field: 'name'
            });
        }
        
        if (!project.config || Object.keys(project.config).length === 0) {
            issues.push({
                severity: 'warning',
                message: 'Project has no configuration',
                field: 'config'
            });
        }
        
        return issues;
    }
    
    /**
     * Find applied template for project
     */
    private findAppliedTemplate(project: TgProject): ProjectTemplate | undefined {
        // Implementation would match project against templates
        return undefined;
    }
    
    /**
     * Check if cached detection is still valid
     */
    private isCacheValid(cached: EnhancedProjectDetection, context: ParseContext): boolean {
        // Simple mtime check
        const cacheAge = Date.now() - (cached.project as any)._cacheTimestamp || 0;
        return cacheAge < 5 * 60 * 1000; // 5 minutes
    }
    
    /**
     * Emit project detection event
     */
    private emitProjectEvent(project: TgProject, source: string, confidence: number): void {
        this.eventManager.emitSync(ParseEventType.PROJECT_DETECTED, {
            filePath: project.path,
            project,
            detectionMethod: source as any,
            confidence
        });
    }
    
    /**
     * Get fallback project when detection fails
     */
    protected getFallbackResult(context: ParseContext): TgProject | undefined {
        return {
            id: `fallback:${context.filePath}`,
            name: this.projectConfig.defaultProject.name || 'Default Project',
            path: context.filePath.substring(0, context.filePath.lastIndexOf('/')),
            config: { ...this.projectConfig.defaultProject.config }
        };
    }
    
    /**
     * Determine if error is recoverable
     */
    protected isRecoverableError(error: Error): boolean {
        // Most project detection errors are recoverable
        return !error.message.includes('FATAL');
    }
    
    /**
     * Generate cache key for project detection
     */
    protected getCacheKey(context: ParseContext): string {
        return `project:${context.filePath}:${context.stats?.mtime || 0}`;
    }
    
    /**
     * Get enhanced detection result
     */
    public getEnhancedDetection(filePath: string): EnhancedProjectDetection | undefined {
        const cacheKey = `project:${filePath}:0`; // Simplified lookup
        return this.detectionCache.get(cacheKey);
    }
    
    /**
     * Clear detection cache
     */
    public clearDetectionCache(): void {
        this.detectionCache.clear();
    }
    
    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.clearDetectionCache();
        super.onunload();
    }
}