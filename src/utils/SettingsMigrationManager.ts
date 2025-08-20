/**
 * Settings Migration Manager
 * 
 * Integrates with the main plugin to handle automatic migration of duplicate
 * settings when the plugin loads or settings are updated.
 */

import { Notice } from "obsidian";
import type TaskProgressBarPlugin from "../index";
import { 
  runAllMigrations, 
  hasSettingsDuplicates, 
  type MigrationResult 
} from "./SettingsMigration";
import { t } from "../translations/helper";

export class SettingsMigrationManager {
  private plugin: TaskProgressBarPlugin;
  private migrationCompleted = false;

  constructor(plugin: TaskProgressBarPlugin) {
    this.plugin = plugin;
  }

  /**
   * Check and run migrations when plugin loads
   */
  async onPluginLoad(): Promise<void> {
    try {
      if (hasSettingsDuplicates(this.plugin.settings)) {
        await this.runMigrationWithUserConsent();
      }
    } catch (error) {
      console.error("Settings migration failed:", error);
      new Notice(t("Settings migration failed. Please check console for details."));
    }
  }

  /**
   * Check for duplicates before saving settings
   */
  async onBeforeSave(): Promise<boolean> {
    // If migration was already completed this session, don't run again
    if (this.migrationCompleted) {
      return true;
    }

    // Check if we need to migrate
    if (hasSettingsDuplicates(this.plugin.settings)) {
      const result = await this.runSilentMigration();
      return result.migrated;
    }

    return true;
  }

  /**
   * Run migration with user notification
   */
  private async runMigrationWithUserConsent(): Promise<void> {
    const result = runAllMigrations(this.plugin.settings);
    
    if (result.migrated) {
      this.migrationCompleted = true;
      await this.plugin.saveSettings();
      
      // Show user-friendly notice
      new Notice(
        t("Task Genius: Settings have been automatically migrated to remove duplicates. ") +
        t("FileSource is now the unified system for file-based task recognition."),
        10000
      );

      // Log details for advanced users
      console.log("Task Genius Settings Migration:", {
        details: result.details,
        warnings: result.warnings
      });
    }

    // Show warnings if any
    if (result.warnings.length > 0) {
      console.warn("Task Genius Migration Warnings:", result.warnings);
    }
  }

  /**
   * Run migration silently without user notification
   */
  private async runSilentMigration(): Promise<MigrationResult> {
    const result = runAllMigrations(this.plugin.settings);
    
    if (result.migrated) {
      this.migrationCompleted = true;
      // Settings will be saved by the calling function
      console.log("Task Genius: Silent settings migration completed", result.details);
    }

    return result;
  }

  /**
   * Force migration (for manual execution)
   */
  async forceMigration(): Promise<MigrationResult> {
    const result = runAllMigrations(this.plugin.settings);
    
    if (result.migrated) {
      this.migrationCompleted = true;
      await this.plugin.saveSettings();
      
      new Notice(
        t("Settings migration completed: ") + result.details.length + t(" changes applied"),
        5000
      );
    } else {
      new Notice(t("No settings migration needed"), 3000);
    }

    return result;
  }

  /**
   * Check if user has conflicting settings
   */
  hasConflicts(): boolean {
    return hasSettingsDuplicates(this.plugin.settings);
  }

  /**
   * Get migration status for display in settings
   */
  getMigrationStatus(): {
    needsMigration: boolean;
    completedThisSession: boolean;
    conflictCount: number;
  } {
    const needsMigration = hasSettingsDuplicates(this.plugin.settings);
    
    // Count conflicts
    let conflictCount = 0;
    const settings = this.plugin.settings;
    
    if (settings.fileParsingConfig?.enableFileMetadataParsing && !settings.fileSource?.enabled) {
      conflictCount++;
    }
    if (settings.fileParsingConfig?.enableTagBasedTaskParsing && !settings.fileSource?.recognitionStrategies?.tags?.enabled) {
      conflictCount++;
    }
    if (settings.fileParsingConfig?.enableWorkerProcessing !== settings.fileSource?.performance?.enableWorkerProcessing) {
      conflictCount++;
    }

    return {
      needsMigration,
      completedThisSession: this.migrationCompleted,
      conflictCount
    };
  }

  /**
   * Reset migration state (for testing)
   */
  resetMigrationState(): void {
    this.migrationCompleted = false;
  }
}