/**
 * Gantt Chart Configuration Manager
 * 
 * Handles persistence and management of Gantt chart configurations including
 * grouping settings, view preferences, and integration with the plugin's
 * view configuration system.
 */

import { Component } from "obsidian";
import TaskProgressBarPlugin from "../../index";
import { GroupingConfig, GroupState } from "../../types/gantt-grouping";
import { ViewConfig, getViewSettingOrDefault } from "../../common/setting-definition";

export interface GanttViewConfig {
	/** Grouping configuration */
	grouping?: GroupingConfig;
	/** Group states (expanded/collapsed) */
	groupStates?: Record<string, boolean>;
	/** View preferences */
	preferences?: GanttViewPreferences;
	/** Last updated timestamp */
	lastUpdated?: number;
	/** Configuration version for migration */
	version?: string;
}

export interface GanttViewPreferences {
	/** Default zoom level */
	defaultZoomLevel?: number;
	/** Default time scale */
	defaultTimeScale?: "Day" | "Week" | "Month" | "Year";
	/** Show task labels */
	showTaskLabels?: boolean;
	/** Use markdown renderer */
	useMarkdownRenderer?: boolean;
	/** Auto-scroll to today */
	autoScrollToToday?: boolean;
	/** Show progress indicators */
	showProgress?: boolean;
	/** Show relations between tasks */
	showRelations?: boolean;
	/** Color scheme */
	colorScheme?: "default" | "dark" | "light" | "custom";
}

export class GanttConfigManager extends Component {
	private plugin: TaskProgressBarPlugin;
	private viewId: string;
	private currentConfig: GanttViewConfig;
	private configKey: string;

	constructor(plugin: TaskProgressBarPlugin, viewId: string = "gantt") {
		super();
		this.plugin = plugin;
		this.viewId = viewId;
		this.configKey = `gantt-config-${viewId}`;
		this.currentConfig = this.getDefaultConfig();
	}

	onload(): void {
		this.loadConfig();
	}

	onunload(): void {
		this.saveConfig();
	}

	/**
	 * Get default configuration
	 */
	private getDefaultConfig(): GanttViewConfig {
		return {
			grouping: {
				primaryGroupBy: "none",
				secondaryGroupBy: "none",
				showGroupHeaders: true,
				collapsibleGroups: true,
				defaultExpanded: true,
				groupHeaderHeight: 30,
				showEmptyGroups: false
			},
			groupStates: {},
			preferences: {
				defaultZoomLevel: 1,
				defaultTimeScale: "Week",
				showTaskLabels: true,
				useMarkdownRenderer: true,
				autoScrollToToday: true,
				showProgress: true,
				showRelations: false,
				colorScheme: "default"
			},
			version: "1.0.0",
			lastUpdated: Date.now()
		};
	}

	/**
	 * Load configuration from plugin settings
	 */
	loadConfig(): GanttViewConfig {
		try {
			// First try to load from view-specific configuration
			const viewConfig = getViewSettingOrDefault(this.plugin, this.viewId);
			
			// Check if there's Gantt-specific config in the view
			if (viewConfig.specificConfig && (viewConfig.specificConfig as any).gantt) {
				this.currentConfig = {
					...this.getDefaultConfig(),
					...(viewConfig.specificConfig as any).gantt
				};
			} else {
				// Fallback to plugin data
				const savedConfig = this.plugin.settings.data?.[this.configKey];
				if (savedConfig) {
					this.currentConfig = {
						...this.getDefaultConfig(),
						...savedConfig
					};
				}
			}

			// Migrate old configurations if needed
			this.migrateConfig();

		} catch (error) {
			console.error("Failed to load Gantt configuration:", error);
			this.currentConfig = this.getDefaultConfig();
		}

		return this.currentConfig;
	}

	/**
	 * Save configuration to plugin settings
	 */
	async saveConfig(): Promise<void> {
		try {
			this.currentConfig.lastUpdated = Date.now();

			// Save to view-specific configuration
			const viewConfigs = this.plugin.settings.viewConfiguration;
			const viewIndex = viewConfigs.findIndex(v => v.id === this.viewId);
			
			if (viewIndex >= 0) {
				// Update existing view configuration
				if (!viewConfigs[viewIndex].specificConfig) {
					viewConfigs[viewIndex].specificConfig = {};
				}
				(viewConfigs[viewIndex].specificConfig as any).gantt = this.currentConfig;
			} else {
				// Fallback to plugin data
				if (!this.plugin.settings.data) {
					this.plugin.settings.data = {};
				}
				this.plugin.settings.data[this.configKey] = this.currentConfig;
			}

			// Save plugin settings
			await this.plugin.saveSettings();

		} catch (error) {
			console.error("Failed to save Gantt configuration:", error);
		}
	}

	/**
	 * Update grouping configuration
	 */
	updateGroupingConfig(config: Partial<GroupingConfig>): void {
		this.currentConfig.grouping = {
			...this.currentConfig.grouping,
			...config
		};
		this.saveConfig();
	}

	/**
	 * Update group states
	 */
	updateGroupStates(states: Record<string, boolean>): void {
		this.currentConfig.groupStates = {
			...this.currentConfig.groupStates,
			...states
		};
		this.saveConfig();
	}

	/**
	 * Update view preferences
	 */
	updatePreferences(preferences: Partial<GanttViewPreferences>): void {
		this.currentConfig.preferences = {
			...this.currentConfig.preferences,
			...preferences
		};
		this.saveConfig();
	}

	/**
	 * Get current configuration
	 */
	getConfig(): GanttViewConfig {
		return { ...this.currentConfig };
	}

	/**
	 * Get grouping configuration
	 */
	getGroupingConfig(): GroupingConfig {
		return { ...this.currentConfig.grouping! };
	}

	/**
	 * Get group states
	 */
	getGroupStates(): Record<string, boolean> {
		return { ...this.currentConfig.groupStates! };
	}

	/**
	 * Get view preferences
	 */
	getPreferences(): GanttViewPreferences {
		return { ...this.currentConfig.preferences! };
	}

	/**
	 * Reset configuration to defaults
	 */
	resetToDefaults(): void {
		this.currentConfig = this.getDefaultConfig();
		this.saveConfig();
	}

	/**
	 * Export configuration for backup/sharing
	 */
	exportConfig(): string {
		return JSON.stringify(this.currentConfig, null, 2);
	}

	/**
	 * Import configuration from backup/sharing
	 */
	importConfig(configJson: string): boolean {
		try {
			const importedConfig = JSON.parse(configJson);
			
			// Validate the imported configuration
			if (this.validateConfig(importedConfig)) {
				this.currentConfig = {
					...this.getDefaultConfig(),
					...importedConfig,
					lastUpdated: Date.now()
				};
				this.saveConfig();
				return true;
			}
		} catch (error) {
			console.error("Failed to import Gantt configuration:", error);
		}
		return false;
	}

	/**
	 * Validate configuration structure
	 */
	private validateConfig(config: any): boolean {
		// Basic validation - can be expanded
		return config && 
			   typeof config === 'object' &&
			   (!config.grouping || typeof config.grouping === 'object') &&
			   (!config.preferences || typeof config.preferences === 'object');
	}

	/**
	 * Migrate old configuration formats
	 */
	private migrateConfig(): void {
		// Check if migration is needed
		if (!this.currentConfig.version || this.currentConfig.version < "1.0.0") {
			// Perform migration logic here
			console.log("Migrating Gantt configuration to version 1.0.0");
			
			// Example migration: ensure all required fields exist
			if (!this.currentConfig.grouping) {
				this.currentConfig.grouping = this.getDefaultConfig().grouping;
			}
			
			if (!this.currentConfig.preferences) {
				this.currentConfig.preferences = this.getDefaultConfig().preferences;
			}
			
			this.currentConfig.version = "1.0.0";
		}
	}

	/**
	 * Get configuration for a specific view
	 */
	static getConfigForView(plugin: TaskProgressBarPlugin, viewId: string): GanttViewConfig {
		const manager = new GanttConfigManager(plugin, viewId);
		return manager.loadConfig();
	}

	/**
	 * Save configuration for a specific view
	 */
	static async saveConfigForView(
		plugin: TaskProgressBarPlugin, 
		viewId: string, 
		config: GanttViewConfig
	): Promise<void> {
		const manager = new GanttConfigManager(plugin, viewId);
		manager.currentConfig = config;
		await manager.saveConfig();
	}
}
