/**
 * Unified Task Parsing System
 * 
 * Central entry point for all task parsing functionality.
 * Provides high-performance, type-safe task parsing with advanced caching,
 * plugin architecture, and Component-based lifecycle management.
 * 
 * @public
 */

// Core Components
export { UnifiedCacheManager } from './core/UnifiedCacheManager';
export { ParseEventManager } from './core/ParseEventManager';
export { ParseContext, ParseContextFactory } from './core/ParseContext';
export { ParserPlugin } from './core/ParserPlugin';
export { ResourceManager, ResourceUtils } from './core/ResourceManager';

// Plugin System
export { PluginManager } from './managers/PluginManager';
export { MarkdownParserPlugin } from './plugins/MarkdownParserPlugin';
export { CanvasParserPlugin } from './plugins/CanvasParserPlugin';
export { MetadataParserPlugin } from './plugins/MetadataParserPlugin';
export { IcsParserPlugin } from './plugins/IcsParserPlugin';
export { ProjectParserPlugin } from './plugins/ProjectParserPlugin';

// Service Layer
export { TaskParsingService } from './managers/TaskParsingService';
export { WorkerManager } from './managers/WorkerManager';

// Types
export type {
    ParseResult,
    ParsePriority,
    CacheType,
    CacheEntry,
    ProjectDetectionStrategy,
    ParserPluginType,
    ParseEventType,
    ParseStatistics
} from './types/ParsingTypes';

// Event System
export { ParseEventType as Events } from './events/ParseEvents';

/**
 * Default export: TaskParsingService factory
 * 
 * @example
 * ```typescript
 * import { createTaskParsingService } from '../parsing';
 * 
 * const parsingService = createTaskParsingService(app, {
 *   maxWorkers: 2,
 *   cacheSize: 1000,
 *   enableProjectDetection: true
 * });
 * 
 * const tasks = await parsingService.parseFile('path/to/file.md');
 * ```
 */
export { createTaskParsingService } from './managers/TaskParsingServiceFactory';