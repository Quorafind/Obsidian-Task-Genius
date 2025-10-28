/**
 * FileSourceConfig - Configuration management for FileSource
 * 
 * Handles configuration validation, defaults, and update management
 * for the FileSource feature.
 */

import type { 
  FileSourceConfiguration,
  MetadataRecognitionConfig,
  TagRecognitionConfig,
  TemplateRecognitionConfig,
  PathRecognitionConfig,
  FileTaskPropertiesConfig,
  RelationshipsConfig,
  PerformanceConfig,
  StatusMappingConfig,
  MetadataMappingConfig
} from "../../types/file-source";

/** Default configuration for metadata-based recognition */
export const DEFAULT_METADATA_CONFIG: MetadataRecognitionConfig = {
  enabled: true,
  taskFields: ["dueDate", "status", "priority", "assigned"],
  requireAllFields: false
};

/** Default configuration for tag-based recognition */
export const DEFAULT_TAG_CONFIG: TagRecognitionConfig = {
  enabled: true,
  taskTags: ["#task", "#actionable", "#todo"],
  matchMode: "exact"
};

/** Default configuration for template-based recognition */
export const DEFAULT_TEMPLATE_CONFIG: TemplateRecognitionConfig = {
  enabled: false,
  templatePaths: ["Templates/Task Template.md"],
  checkTemplateMetadata: true
};

/** Default configuration for path-based recognition */
export const DEFAULT_PATH_CONFIG: PathRecognitionConfig = {
  enabled: false,
  taskPaths: ["Projects/", "Tasks/"],
  matchMode: "prefix"
};

/** Default configuration for file task properties */
export const DEFAULT_FILE_TASK_PROPERTIES: FileTaskPropertiesConfig = {
  contentSource: "filename",
  stripExtension: true,
  defaultStatus: " ",
  defaultPriority: undefined,
  preferFrontmatterTitle: true
};

/** Default configuration for relationships */
export const DEFAULT_RELATIONSHIPS_CONFIG: RelationshipsConfig = {
  enableChildRelationships: true,
  enableMetadataInheritance: true,
  inheritanceFields: ["project", "priority", "context"]
};

/** Default configuration for performance */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableWorkerProcessing: true,
  enableCaching: true,
  cacheTTL: 300000 // 5 minutes
};

/** Default status mapping configuration */
export const DEFAULT_STATUS_MAPPING_CONFIG: StatusMappingConfig = {
  enabled: true,
  metadataToSymbol: {
    // Completed variants
    'completed': 'x',
    'done': 'x',
    'finished': 'x',
    'complete': 'x',
    'checked': 'x',
    'resolved': 'x',
    'closed': 'x',
    'x': 'x',
    'X': 'x',
    
    // In Progress variants
    'in-progress': '/',
    'in progress': '/',
    'inprogress': '/',
    'doing': '/',
    'working': '/',
    'active': '/',
    'started': '/',
    'ongoing': '/',
    '/': '/',
    '>': '/',
    
    // Planned variants
    'planned': '?',
    'todo': '?',
    'pending': '?',
    'scheduled': '?',
    'queued': '?',
    'waiting': '?',
    'later': '?',
    '?': '?',
    
    // Abandoned variants
    'cancelled': '-',
    'canceled': '-',
    'abandoned': '-',
    'dropped': '-',
    'skipped': '-',
    'deferred': '-',
    'wontfix': '-',
    "won't fix": '-',
    '-': '-',
    
    // Not Started variants
    'not-started': ' ',
    'not started': ' ',
    'notstarted': ' ',
    'new': ' ',
    'open': ' ',
    'created': ' ',
    'unstarted': ' ',
    ' ': ' '
  },
  symbolToMetadata: {
    'x': 'completed',
    'X': 'completed',
    '/': 'in-progress',
    '>': 'in-progress',
    '?': 'planned',
    '-': 'cancelled',
    ' ': 'not-started'
  },
  autoDetect: true,
  caseSensitive: false
};

/** Default metadata mappings */
export const DEFAULT_METADATA_MAPPINGS: MetadataMappingConfig[] = [];

/** Complete default FileSource configuration */
export const DEFAULT_FILE_SOURCE_CONFIG: FileSourceConfiguration = {
  enabled: false, // Disabled by default for backward compatibility
  recognitionStrategies: {
    metadata: DEFAULT_METADATA_CONFIG,
    tags: DEFAULT_TAG_CONFIG,
    templates: DEFAULT_TEMPLATE_CONFIG,
    paths: DEFAULT_PATH_CONFIG
  },
  metadataMappings: [...DEFAULT_METADATA_MAPPINGS],
  fileTaskProperties: DEFAULT_FILE_TASK_PROPERTIES,
  relationships: DEFAULT_RELATIONSHIPS_CONFIG,
  performance: DEFAULT_PERFORMANCE_CONFIG,
  statusMapping: DEFAULT_STATUS_MAPPING_CONFIG
};

/**
 * FileSourceConfig - Manages FileSource configuration
 */
export class FileSourceConfig {
  private config: FileSourceConfiguration;
  private listeners: Array<(config: FileSourceConfiguration) => void> = [];

  constructor(initialConfig?: Partial<FileSourceConfiguration>) {
    this.config = this.mergeWithDefaults(initialConfig || {});
  }

  /**
   * Get current configuration
   */
  getConfig(): FileSourceConfiguration {
    return { ...this.config };
  }

  /**
   * Update configuration with partial updates
   */
  updateConfig(updates: Partial<FileSourceConfiguration>): void {
    const newConfig = this.mergeWithDefaults(updates);
    const hasChanged = !this.deepEqual(newConfig, this.config);

    if (hasChanged) {
      this.config = newConfig;
      this.notifyListeners();
    }
  }

  /**
   * Subscribe to configuration changes
   */
  onChange(listener: (config: FileSourceConfiguration) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Check if FileSource is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get recognition strategies that are enabled
   */
  getEnabledStrategies(): string[] {
    const strategies: string[] = [];
    const { recognitionStrategies } = this.config;

    if (recognitionStrategies.metadata.enabled) strategies.push("metadata");
    if (recognitionStrategies.tags.enabled) strategies.push("tags");
    if (recognitionStrategies.templates.enabled) strategies.push("templates");
    if (recognitionStrategies.paths.enabled) strategies.push("paths");

    return strategies;
  }

  /**
   * Validate configuration and return any errors
   */
  validateConfig(config: Partial<FileSourceConfiguration>): string[] {
    const errors: string[] = [];

    // Validate recognition strategies
    if (config.recognitionStrategies) {
      const strategies = config.recognitionStrategies;
      
      // Check if at least one strategy is enabled when FileSource is enabled
      if (config.enabled !== false) {
        const hasEnabledStrategy = Object.values(strategies).some(strategy => 
          strategy && strategy.enabled
        );
        if (!hasEnabledStrategy) {
          errors.push("At least one recognition strategy must be enabled");
        }
      }

      // Validate metadata strategy
      if (strategies.metadata?.taskFields?.length === 0) {
        errors.push("Metadata strategy requires at least one task field");
      }

      // Validate tag strategy
      if (strategies.tags?.taskTags?.length === 0) {
        errors.push("Tag strategy requires at least one task tag");
      }

      // Validate template strategy
      if (strategies.templates?.templatePaths?.length === 0) {
        errors.push("Template strategy requires at least one template path");
      }

      // Validate path strategy
      if (strategies.paths?.taskPaths?.length === 0) {
        errors.push("Path strategy requires at least one task path");
      }
    }

    // Validate file task properties
    if (config.fileTaskProperties) {
      const props = config.fileTaskProperties;
      
      if (props.contentSource === "custom" && !props.customContentField) {
        errors.push("Custom content source requires customContentField to be specified");
      }
    }

    // Validate performance config
    if (config.performance) {
      const perf = config.performance;
      
      if (perf.cacheTTL && perf.cacheTTL < 0) {
        errors.push("Cache TTL must be a positive number");
      }
    }

    if (config.metadataMappings) {
      config.metadataMappings.forEach((mapping, index) => {
        const sourceKey =
          typeof mapping?.sourceKey === "string"
            ? mapping.sourceKey.trim()
            : "";
        const targetKey =
          typeof mapping?.targetKey === "string"
            ? mapping.targetKey.trim()
            : "";

        if (!sourceKey) {
          errors.push(`Metadata mapping ${index + 1} requires a source key`);
        }
        if (!targetKey) {
          errors.push(`Metadata mapping ${index + 1} requires a target key`);
        }
      });
    }

    // Validate status mapping config
    if (config.statusMapping?.enabled) {
      const mapping = config.statusMapping;
      
      if (Object.keys(mapping.metadataToSymbol || {}).length === 0) {
        errors.push("Status mapping requires at least one metadata to symbol mapping");
      }
      
      if (Object.keys(mapping.symbolToMetadata || {}).length === 0) {
        errors.push("Status mapping requires at least one symbol to metadata mapping");
      }
    }

    return errors;
  }

  /**
   * Merge partial configuration with defaults
   */
  private mergeWithDefaults(partial: Partial<FileSourceConfiguration>): FileSourceConfiguration {
    return {
      enabled: partial.enabled ?? DEFAULT_FILE_SOURCE_CONFIG.enabled,
      recognitionStrategies: {
        metadata: {
          ...DEFAULT_METADATA_CONFIG,
          ...partial.recognitionStrategies?.metadata,
        },
        tags: {
          ...DEFAULT_TAG_CONFIG,
          ...partial.recognitionStrategies?.tags,
        },
        templates: {
          ...DEFAULT_TEMPLATE_CONFIG,
          ...partial.recognitionStrategies?.templates,
        },
        paths: {
          ...DEFAULT_PATH_CONFIG,
          ...partial.recognitionStrategies?.paths,
        },
      },
      metadataMappings: this.normalizeMetadataMappings(
        partial.metadataMappings ?? DEFAULT_METADATA_MAPPINGS,
      ),
      fileTaskProperties: {
        ...DEFAULT_FILE_TASK_PROPERTIES,
        ...partial.fileTaskProperties,
      },
      relationships: {
        ...DEFAULT_RELATIONSHIPS_CONFIG,
        ...partial.relationships,
      },
      performance: {
        ...DEFAULT_PERFORMANCE_CONFIG,
        ...partial.performance,
      },
      statusMapping: {
        ...DEFAULT_STATUS_MAPPING_CONFIG,
        ...partial.statusMapping,
      },
    };
  }

  /**
   * Normalize metadata mappings: trim keys, drop invalid entries
   */
  private normalizeMetadataMappings(
    mappings?: MetadataMappingConfig[] | null,
  ): MetadataMappingConfig[] {
    if (!Array.isArray(mappings)) {
      return [];
    }

    const normalized: MetadataMappingConfig[] = [];

    for (const mapping of mappings) {
      if (!mapping) continue;
      const sourceKey =
        typeof mapping.sourceKey === "string" ? mapping.sourceKey.trim() : "";
      const targetKey =
        typeof mapping.targetKey === "string" ? mapping.targetKey.trim() : "";

      if (!sourceKey || !targetKey) {
        continue;
      }

      normalized.push({
        sourceKey,
        targetKey,
        enabled: mapping.enabled !== false,
      });
    }

    return normalized;
  }

  /**
   * Deep equality check for configuration objects
   * @param obj1 First object to compare
   * @param obj2 Second object to compare
   * @returns True if objects are deeply equal
   */
  private deepEqual(obj1: any, obj2: any): boolean {
    // Handle primitive types and null
    if (obj1 === obj2) return true;
    if (obj1 == null || obj2 == null) return false;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;

    // Handle arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      if (obj1.length !== obj2.length) return false;
      for (let i = 0; i < obj1.length; i++) {
        if (!this.deepEqual(obj1[i], obj2[i])) return false;
      }
      return true;
    }

    // One is array, the other is not
    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

    // Handle objects
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);

    if (keys1.length !== keys2.length) return false;

    for (const key of keys1) {
      if (!keys2.includes(key)) return false;
      if (!this.deepEqual(obj1[key], obj2[key])) return false;
    }

    return true;
  }

  /**
   * Notify all listeners of configuration changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.config);
      } catch (error) {
        console.error('FileSourceConfig: Error in change listener:', error);
      }
    });
  }

  /**
   * Map a metadata status value to a task symbol
   * @param metadataValue The metadata value (e.g., "completed", "in-progress")
   * @returns The corresponding task symbol (e.g., "x", "/") or the original value if no mapping exists
   */
  mapMetadataToSymbol(metadataValue: string): string {
    const { statusMapping } = this.config;
    
    if (!statusMapping.enabled) {
      return metadataValue;
    }
    
    // Handle case sensitivity
    const lookupValue = statusMapping.caseSensitive 
      ? metadataValue 
      : metadataValue.toLowerCase();
    
    // Find matching key in the mapping (case-insensitive search if needed)
    for (const [key, symbol] of Object.entries(statusMapping.metadataToSymbol)) {
      const compareKey = statusMapping.caseSensitive ? key : key.toLowerCase();
      if (compareKey === lookupValue) {
        return symbol;
      }
    }
    
    // Return original value if no mapping found
    return metadataValue;
  }
  
  /**
   * Map a task symbol to a metadata status value
   * @param symbol The task symbol (e.g., "x", "/")
   * @returns The corresponding metadata value (e.g., "completed", "in-progress") or the original symbol if no mapping exists
   */
  mapSymbolToMetadata(symbol: string): string {
    const { statusMapping } = this.config;
    
    if (!statusMapping.enabled) {
      return symbol;
    }
    
    // Direct lookup for symbols (usually case-sensitive)
    return statusMapping.symbolToMetadata[symbol] || symbol;
  }
  
  /**
   * Check if a value is a recognized status (either metadata value or symbol)
   * @param value The value to check
   * @returns True if the value is recognized as a status
   */
  isRecognizedStatus(value: string): boolean {
    const { statusMapping } = this.config;
    
    if (!statusMapping.enabled) {
      return false;
    }
    
    const lookupValue = statusMapping.caseSensitive 
      ? value 
      : value.toLowerCase();
    
    // Check if it's a known metadata value
    for (const key of Object.keys(statusMapping.metadataToSymbol)) {
      const compareKey = statusMapping.caseSensitive ? key : key.toLowerCase();
      if (compareKey === lookupValue) {
        return true;
      }
    }
    
    // Check if it's a known symbol
    return value in statusMapping.symbolToMetadata;
  }
  
  /**
   * Sync status mappings with current task status configuration
   * @param taskStatuses The current task status configuration from settings
   */
  syncWithTaskStatuses(taskStatuses: Record<string, string>): void {
    if (!this.config.statusMapping.autoDetect) {
      return;
    }

    // Extract symbols from task status configuration
    const symbolToType: Record<string, string> = {};
    const typeToSymbols: Record<string, string[]> = {};

    for (const [type, symbols] of Object.entries(taskStatuses)) {
      const symbolList = symbols.split('|').filter(s => s);
      typeToSymbols[type] = typeToSymbols[type] || [];
      for (const symbol of symbolList) {
        // Handle potential pattern like '/>' being split into '/' and '>'
        if (symbol.length === 1 || symbol === '/>') {
          if (symbol === '/>') {
            symbolToType['/'] = type;
            symbolToType['>'] = type;
            typeToSymbols[type].push('/');
            typeToSymbols[type].push('>');
          } else {
            symbolToType[symbol] = type;
            typeToSymbols[type].push(symbol);
          }
        } else {
          // For multi-character symbols, add each character separately
          for (const char of symbol) {
            symbolToType[char] = type;
            typeToSymbols[type].push(char);
          }
        }
      }
    }

    // Update symbol to metadata mappings based on type
    const typeToMetadata: Record<string, string> = {
      'completed': 'completed',
      'inProgress': 'in-progress',
      'planned': 'planned',
      'abandoned': 'cancelled',
      'notStarted': 'not-started'
    };

    for (const [symbol, type] of Object.entries(symbolToType)) {
      if (typeToMetadata[type]) {
        this.config.statusMapping.symbolToMetadata[symbol] = typeToMetadata[type];
      }
    }

    // Also update metadata->symbol so metadata strings map back to the user's preferred symbol
    const preferredFallback: Record<string, string> = {
      completed: 'x',
      inProgress: '/',
      planned: '?',
      abandoned: '-',
      notStarted: ' '
    };
    for (const [type, mdValue] of Object.entries(typeToMetadata)) {
      const symbols = typeToSymbols[type] || [];
      const preferred = symbols[0] || preferredFallback[type];
      if (mdValue && preferred !== undefined) {
        this.config.statusMapping.metadataToSymbol[mdValue] = preferred;
      }
    }

    this.notifyListeners();
  }

  /**
   * Create a configuration preset for common use cases
   */
  static createPreset(presetName: 'basic' | 'metadata-only' | 'tag-only' | 'full'): Partial<FileSourceConfiguration> {
    switch (presetName) {
      case 'basic':
        return {
          enabled: true,
          recognitionStrategies: {
            metadata: { ...DEFAULT_METADATA_CONFIG, enabled: true },
            tags: { ...DEFAULT_TAG_CONFIG, enabled: false },
            templates: { ...DEFAULT_TEMPLATE_CONFIG, enabled: false },
            paths: { ...DEFAULT_PATH_CONFIG, enabled: false }
          }
        };

      case 'metadata-only':
        return {
          enabled: true,
          recognitionStrategies: {
            metadata: { ...DEFAULT_METADATA_CONFIG, enabled: true },
            tags: { ...DEFAULT_TAG_CONFIG, enabled: false },
            templates: { ...DEFAULT_TEMPLATE_CONFIG, enabled: false },
            paths: { ...DEFAULT_PATH_CONFIG, enabled: false }
          }
        };

      case 'tag-only':
        return {
          enabled: true,
          recognitionStrategies: {
            metadata: { ...DEFAULT_METADATA_CONFIG, enabled: false },
            tags: { ...DEFAULT_TAG_CONFIG, enabled: true },
            templates: { ...DEFAULT_TEMPLATE_CONFIG, enabled: false },
            paths: { ...DEFAULT_PATH_CONFIG, enabled: false }
          }
        };

      case 'full':
        return {
          enabled: true,
          recognitionStrategies: {
            metadata: { ...DEFAULT_METADATA_CONFIG, enabled: true },
            tags: { ...DEFAULT_TAG_CONFIG, enabled: true },
            templates: { ...DEFAULT_TEMPLATE_CONFIG, enabled: false },
            paths: { ...DEFAULT_PATH_CONFIG, enabled: false }
          }
        };

      default:
        return {};
    }
  }
}
