import type { App, TFile, Vault, MetadataCache, EventRef } from "obsidian";
import { Events, emit, on } from "../events/Events";

/**
 * ObsidianSource - Independent event source management
 * 
 * This component manages all Obsidian vault events and transforms them into
 * standardized internal events. It provides:
 * - Unified debouncing and batch merging
 * - Event transformation and filtering
 * - Independent lifecycle management
 */
export class ObsidianSource {
  private app: App;
  private vault: Vault;
  private metadataCache: MetadataCache;
  
  // Event references for cleanup
  private eventRefs: EventRef[] = [];
  
  // Debouncing configuration
  private readonly DEBOUNCE_DELAY = 300; // ms
  private readonly BATCH_DELAY = 150; // ms for batch operations
  
  // Debouncing maps
  private pendingFileChanges = new Map<string, NodeJS.Timeout>();
  private pendingMetadataChanges = new Map<string, NodeJS.Timeout>();
  private pendingBatch = new Set<string>();
  private batchTimeout: NodeJS.Timeout | null = null;
  
  // Event filtering
  private readonly IGNORED_EXTENSIONS = new Set(['.tmp', '.swp', '.log']);
  private readonly RELEVANT_EXTENSIONS = new Set(['md', 'canvas']);
  
  // Skip modification tracking for WriteAPI operations
  private skipNextModify = new Set<string>();

  constructor(app: App, vault: Vault, metadataCache: MetadataCache) {
    this.app = app;
    this.vault = vault;
    this.metadataCache = metadataCache;
  }

  /**
   * Initialize event subscriptions
   */
  initialize(): void {
    console.log('ObsidianSource: Initializing event subscriptions');
    
    // Listen for WriteAPI operations to skip their modifications
    this.eventRefs.push(
      on(this.app, Events.WRITE_OPERATION_START, ({ path }) => {
        this.skipNextModify.add(path);
        // Auto cleanup after 5 seconds to prevent memory leaks
        setTimeout(() => this.skipNextModify.delete(path), 5000);
      })
    );
    
    // File system events
    this.eventRefs.push(
      this.vault.on('create', this.onFileCreate.bind(this)),
      this.vault.on('modify', this.onFileModify.bind(this)),
      this.vault.on('delete', this.onFileDelete.bind(this)),
      this.vault.on('rename', this.onFileRename.bind(this))
    );
    
    // Metadata cache events  
    this.eventRefs.push(
      this.metadataCache.on('changed', this.onMetadataChange.bind(this)),
      this.metadataCache.on('resolve', this.onMetadataResolve.bind(this))
    );
    
    console.log(`ObsidianSource: Subscribed to ${this.eventRefs.length} event types`);
  }

  /**
   * Handle file creation
   */
  private onFileCreate(file: TFile): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    console.log(`ObsidianSource: File created - ${file.path}`);
    
    // Emit immediate event for file creation
    emit(this.app, Events.FILE_UPDATED, {
      path: file.path,
      reason: 'create',
      timestamp: Date.now()
    });
  }

  /**
   * Handle file modification with debouncing
   */
  private onFileModify(file: TFile): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    // Skip if this modification is from WriteAPI
    if (this.skipNextModify.has(file.path)) {
      this.skipNextModify.delete(file.path);
      console.log(`ObsidianSource: Skipping modify event for ${file.path} (WriteAPI operation)`);
      return;
    }
    
    // Clear existing timeout for this file
    const existingTimeout = this.pendingFileChanges.get(file.path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new debounced timeout
    const timeout = setTimeout(() => {
      this.pendingFileChanges.delete(file.path);
      this.emitFileUpdated(file.path, 'modify');
    }, this.DEBOUNCE_DELAY);
    
    this.pendingFileChanges.set(file.path, timeout);
  }

  /**
   * Handle file deletion
   */
  private onFileDelete(file: TFile): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    console.log(`ObsidianSource: File deleted - ${file.path}`);
    
    // Clear any pending changes for this file
    const existingTimeout = this.pendingFileChanges.get(file.path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.pendingFileChanges.delete(file.path);
    }
    
    // Emit immediate event for file deletion
    emit(this.app, Events.FILE_UPDATED, {
      path: file.path,
      reason: 'delete',
      timestamp: Date.now()
    });
  }

  /**
   * Handle file rename/move
   */
  private onFileRename(file: TFile, oldPath: string): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    console.log(`ObsidianSource: File renamed - ${oldPath} -> ${file.path}`);
    
    // Clear any pending changes for the old path
    const existingTimeout = this.pendingFileChanges.get(oldPath);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
      this.pendingFileChanges.delete(oldPath);
    }
    
    // Emit immediate events for both old and new paths
    emit(this.app, Events.FILE_UPDATED, {
      path: oldPath,
      reason: 'delete',
      timestamp: Date.now()
    });
    
    emit(this.app, Events.FILE_UPDATED, {
      path: file.path,
      reason: 'rename',
      timestamp: Date.now()
    });
  }

  /**
   * Handle metadata changes with debouncing
   */
  private onMetadataChange(file: TFile): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    // Clear existing timeout for this file
    const existingTimeout = this.pendingMetadataChanges.get(file.path);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Set new debounced timeout
    const timeout = setTimeout(() => {
      this.pendingMetadataChanges.delete(file.path);
      this.emitFileUpdated(file.path, 'frontmatter');
    }, this.DEBOUNCE_DELAY);
    
    this.pendingMetadataChanges.set(file.path, timeout);
  }

  /**
   * Handle metadata resolution (usually after initial scan)
   */
  private onMetadataResolve(file: TFile): void {
    if (!this.isRelevantFile(file)) {
      return;
    }
    
    // Add to batch for bulk processing
    this.addToBatch(file.path);
  }

  /**
   * Add file to batch processing queue
   */
  private addToBatch(filePath: string): void {
    this.pendingBatch.add(filePath);
    
    // Clear existing batch timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Set new batch timeout
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
  }

  /**
   * Process accumulated batch of file changes
   */
  private processBatch(): void {
    if (this.pendingBatch.size === 0) {
      return;
    }
    
    const files = Array.from(this.pendingBatch);
    this.pendingBatch.clear();
    this.batchTimeout = null;
    
    console.log(`ObsidianSource: Processing batch of ${files.length} files`);
    
    // Emit batch update event
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles: files,
      stats: {
        total: files.length,
        changed: files.length
      },
      timestamp: Date.now(),
      seq: Date.now() // Events module will handle proper sequence numbering
    });
  }

  /**
   * Emit a file updated event
   */
  private emitFileUpdated(filePath: string, reason: 'modify' | 'frontmatter' | 'create' | 'delete' | 'rename'): void {
    console.log(`ObsidianSource: Emitting file update - ${filePath} (${reason})`);
    
    emit(this.app, Events.FILE_UPDATED, {
      path: filePath,
      reason,
      timestamp: Date.now()
    });
  }

  /**
   * Check if a file is relevant for task processing
   */
  private isRelevantFile(file: TFile): boolean {
    // Skip non-files
    if (!file || typeof file.path !== 'string') {
      return false;
    }
    
    // Skip files with ignored extensions
    const extension = file.extension?.toLowerCase();
    if (!extension || this.IGNORED_EXTENSIONS.has(`.${extension}`)) {
      return false;
    }
    
    // Only process relevant file types
    if (!this.RELEVANT_EXTENSIONS.has(extension)) {
      return false;
    }
    
    // Skip system/hidden files
    if (file.path.startsWith('.') || file.path.includes('/.')) {
      return false;
    }
    
    return true;
  }

  /**
   * Manually trigger processing of specific files (for testing or recovery)
   */
  triggerFileUpdate(filePath: string, reason: 'modify' | 'frontmatter' | 'create' | 'delete' | 'rename' = 'modify'): void {
    this.emitFileUpdated(filePath, reason);
  }

  /**
   * Trigger batch processing of multiple files
   */
  triggerBatchUpdate(filePaths: string[]): void {
    if (filePaths.length === 0) {
      return;
    }
    
    console.log(`ObsidianSource: Manual batch trigger for ${filePaths.length} files`);
    
    emit(this.app, Events.TASK_CACHE_UPDATED, {
      changedFiles: filePaths,
      stats: {
        total: filePaths.length,
        changed: filePaths.length
      },
      timestamp: Date.now(),
      seq: Date.now()
    });
  }

  /**
   * Force flush all pending debounced changes
   */
  flush(): void {
    console.log('ObsidianSource: Flushing all pending changes');
    
    // Process all pending file changes
    for (const [filePath, timeout] of this.pendingFileChanges) {
      clearTimeout(timeout);
      this.emitFileUpdated(filePath, 'modify');
    }
    this.pendingFileChanges.clear();
    
    // Process all pending metadata changes
    for (const [filePath, timeout] of this.pendingMetadataChanges) {
      clearTimeout(timeout);
      this.emitFileUpdated(filePath, 'frontmatter');
    }
    this.pendingMetadataChanges.clear();
    
    // Process pending batch
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.processBatch();
    }
  }

  /**
   * Get statistics about pending operations
   */
  getStats() {
    return {
      pendingFileChanges: this.pendingFileChanges.size,
      pendingMetadataChanges: this.pendingMetadataChanges.size,
      pendingBatchSize: this.pendingBatch.size,
      hasBatchTimeout: this.batchTimeout !== null
    };
  }

  /**
   * Cleanup resources and unsubscribe from events
   */
  destroy(): void {
    console.log('ObsidianSource: Cleaning up event subscriptions');
    
    // Clear all debouncing timeouts
    for (const timeout of this.pendingFileChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingFileChanges.clear();
    
    for (const timeout of this.pendingMetadataChanges.values()) {
      clearTimeout(timeout);
    }
    this.pendingMetadataChanges.clear();
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
    
    this.pendingBatch.clear();
    
    // Unsubscribe from all events
    this.eventRefs.forEach(ref => {
      this.app.vault.offref(ref);
    });
    this.eventRefs.length = 0;
    
    console.log('ObsidianSource: Cleanup complete');
  }
}