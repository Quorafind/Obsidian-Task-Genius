/**
 * IcsSource - Event source for ICS calendar data
 *
 * This source integrates external calendar events into the dataflow architecture.
 * It listens to IcsManager updates and emits standardized dataflow events.
 */

import { App, EventRef } from "obsidian";
import { Events, emit, Seq } from "../events/Events";
import type { IcsManager } from "../../managers/ics-manager";
import type { Task } from "../../types/task";

export class IcsSource {
  private eventRefs: EventRef[] = [];
  private isInitialized = false;
  private lastIcsUpdateSeq = 0;

  constructor(
    private app: App,
    private getIcsManager: () => IcsManager | undefined
  ) {}

  /**
   * Initialize the ICS source and start listening for calendar updates
   */
  initialize(): void {
    if (this.isInitialized) return;

    console.log("[IcsSource] Initializing ICS event source...");

    // Subscribe to ICS manager updates first so we don't miss early signals
    this.subscribeToIcsUpdates();

    // Initial load of ICS events (may be no-op if manager not ready yet)
    this.loadAndEmitIcsEvents();

    // Fallback: retry until ICS manager becomes available (up to ~30s)
    this.ensureManagerAndLoad(0);

    this.isInitialized = true;
  }
  /**
   * Ensure ICS manager becomes available shortly after startup and then load
   */
  private ensureManagerAndLoad(attempt: number): void {
    const maxAttempts = 30; // ~30s with 1s interval
    if (this.getIcsManager()) {
      this.loadAndEmitIcsEvents();
      return;
    }
    if (attempt >= maxAttempts) {
      console.warn("[IcsSource] ICS manager not available after retries");
      return;
    }
    setTimeout(() => this.ensureManagerAndLoad(attempt + 1), 1000);
  }

  /**
   * Subscribe to ICS manager update events
   */
  private subscribeToIcsUpdates(): void {
    // Listen for ICS cache updates
    this.app.workspace.on("ics-cache-updated" as any, () => {
      console.log("[IcsSource] ICS cache updated, reloading events...");
      this.loadAndEmitIcsEvents();
    });

    // Listen for ICS configuration changes
    this.app.workspace.on("ics-config-changed" as any, () => {
      console.log("[IcsSource] ICS config changed, reloading events...");
      this.loadAndEmitIcsEvents();
    });
  }

  /**
   * Load ICS events from manager and emit update event
   */
  private async loadAndEmitIcsEvents(): Promise<void> {
    const icsManager = this.getIcsManager();
    if (!icsManager) {
      console.log("[IcsSource] No ICS manager available");
      return;
    }

    try {
      // Get all ICS events with sync
      const icsEvents = await icsManager.getAllEventsWithSync();

      // Convert ICS events to IcsTask format via manager to ensure proper shape
      const icsTasks: Task[] = icsManager.convertEventsToTasks(icsEvents);

      console.log(`[IcsSource] Loaded ${icsTasks.length} ICS events`);

      // Generate sequence for this update
      this.lastIcsUpdateSeq = Seq.next();

      // Emit ICS events update
      emit(this.app, Events.ICS_EVENTS_UPDATED, {
        events: icsTasks,
        timestamp: Date.now(),
        seq: this.lastIcsUpdateSeq,
        stats: {
          total: icsTasks.length,
          sources: this.getSourceStats(icsTasks)
        }
      });

    } catch (error) {
      console.error("[IcsSource] Error loading ICS events:", error);

      // Emit empty update on error to clear stale data
      emit(this.app, Events.ICS_EVENTS_UPDATED, {
        events: [],
        timestamp: Date.now(),
        seq: Seq.next(),
        error: error.message
      });
    }
  }

  /**
   * Get statistics about ICS sources
   */
  private getSourceStats(events: Task[]): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const event of events) {
      const sourceId = event.metadata?.source?.id || 'unknown';
      stats[sourceId] = (stats[sourceId] || 0) + 1;
    }

    return stats;
  }

  /**
   * Refresh ICS events manually
   */
  async refresh(): Promise<void> {
    console.log("[IcsSource] Manual refresh triggered");
    await this.loadAndEmitIcsEvents();
  }

  /**
   * Get current statistics
   */
  getStats(): {
    initialized: boolean;
    lastUpdateSeq: number;
  } {
    return {
      initialized: this.isInitialized,
      lastUpdateSeq: this.lastIcsUpdateSeq
    };
  }

  /**
   * Cleanup and destroy the source
   */
  destroy(): void {
    console.log("[IcsSource] Destroying ICS source...");

    // Clear event listeners
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];

    // Emit clear event
    emit(this.app, Events.ICS_EVENTS_UPDATED, {
      events: [],
      timestamp: Date.now(),
      seq: Seq.next(),
      destroyed: true
    });

    this.isInitialized = false;
  }
}