import { App, Notice } from "obsidian";
import {
	EffectiveSettings,
	HiddenModulesConfig,
	WORKSPACE_SCOPED_KEYS,
	WorkspaceData,
	WorkspaceOverrides,
	WorkspacesConfig,
} from "@/types/workspace";
import {
	emitDefaultWorkspaceChanged,
	emitWorkspaceCreated,
	emitWorkspaceDeleted,
	emitWorkspaceOverridesSaved,
	emitWorkspaceRenamed,
	emitWorkspaceReset,
	emitWorkspaceSwitched,
} from "@/components/features/fluent/events/ui-event";
import { emit, Events } from "@/dataflow/events/Events";
import { t } from "@/translations/helper";
import type TaskProgressBarPlugin from "@/index";

export class WorkspaceManager {
	private app: App;
	private plugin: TaskProgressBarPlugin;
	private effectiveCache: Map<string, EffectiveSettings> = new Map();

	constructor(plugin: TaskProgressBarPlugin) {
		this.plugin = plugin;
		this.app = plugin.app;
	}

	// Get the workspace configuration, initializing if needed
	private getWorkspacesConfig(): WorkspacesConfig {
		if (!this.plugin.settings.workspaces) {
			return this.initializeWorkspaces();
		}
		return this.plugin.settings.workspaces;
	}

	// Initialize workspace system
	private initializeWorkspaces(): WorkspacesConfig {
		const defaultId = this.generateId();
		this.plugin.settings.workspaces = {
			version: 2,
			defaultWorkspaceId: defaultId,
			activeWorkspaceId: defaultId,
			order: [defaultId],
			byId: {
				[defaultId]: {
					id: defaultId,
					name: t("Default"),
					updatedAt: Date.now(),
					settings: {}, // Default workspace has no overrides
				},
			},
		};
		return this.plugin.settings.workspaces;
	}

	// Ensure default workspace invariants
	public ensureDefaultWorkspaceInvariant(): void {
		const config = this.getWorkspacesConfig();

		// Ensure default workspace exists
		if (
			!config.defaultWorkspaceId ||
			!config.byId[config.defaultWorkspaceId]
		) {
			const defaultId = this.generateId();
			config.defaultWorkspaceId = defaultId;
			config.byId[defaultId] = {
				id: defaultId,
				name: t("Default"),
				updatedAt: Date.now(),
				settings: {},
			};
			if (!config.order.includes(defaultId)) {
				config.order.unshift(defaultId);
			}
		}

		// Ensure default workspace has no overrides
		const defaultWs = config.byId[config.defaultWorkspaceId];
		if (defaultWs.settings && Object.keys(defaultWs.settings).length > 0) {
			// Merge any overrides into global settings and clear
			this.mergeIntoGlobal(defaultWs.settings);
			defaultWs.settings = {};
		}

		// Ensure active workspace exists
		if (
			!config.activeWorkspaceId ||
			!config.byId[config.activeWorkspaceId]
		) {
			config.activeWorkspaceId = config.defaultWorkspaceId;
		}
	}

	// Merge workspace overrides into global settings
	private mergeIntoGlobal(overrides: WorkspaceOverrides): void {
		for (const key of Object.keys(overrides)) {
			if (WORKSPACE_SCOPED_KEYS.includes(key as any)) {
				(this.plugin.settings as any)[key] = structuredClone(
					overrides[key as keyof WorkspaceOverrides],
				);
			}
		}
	}

	// Generate effective settings for a workspace
	public getEffectiveSettings(workspaceId?: string): EffectiveSettings {
		const config = this.getWorkspacesConfig();
		const id =
			workspaceId ||
			config.activeWorkspaceId ||
			config.defaultWorkspaceId;

		// Return from cache if available

		console.log("[TG-WORKSPACE] getEffectiveSettings:start", {
			requestId: workspaceId || null,
			configActive: config.activeWorkspaceId,
			defaultId: config.defaultWorkspaceId,
			resolvedId: id,
			cached: this.effectiveCache.has(id),
		});

		if (this.effectiveCache.has(id)) {
			return this.effectiveCache.get(id)!;
		}

		// Build effective settings
		const workspace = config.byId[id];
		if (!workspace) {
			// Fallback to default if workspace doesn't exist
			return this.getEffectiveSettings(config.defaultWorkspaceId);
		}

		// Start with global settings, but DO NOT inherit fluentFilterState from global (workspace-scoped)
		const effective: EffectiveSettings = { ...this.plugin.settings };
		// Explicitly drop any global fluentFilterState to avoid cross-workspace leakage
		(effective as any).fluentFilterState = undefined;

		// Apply workspace overrides if not default
		if (id !== config.defaultWorkspaceId && workspace.settings) {
			for (const key of WORKSPACE_SCOPED_KEYS) {
				if (workspace.settings[key] !== undefined) {
					effective[key] = structuredClone(workspace.settings[key]);
				}
			}
		}

		// Always apply fluentFilterState from workspace settings (including default)
		if (
			workspace.settings &&
			workspace.settings.fluentFilterState !== undefined
		) {
			effective.fluentFilterState = structuredClone(
				workspace.settings.fluentFilterState,
			);
		}

		// Cache the result
		this.effectiveCache.set(id, effective);
		return effective;
	}

	// Calculate overrides from effective settings
	private toOverrides(effective: EffectiveSettings): WorkspaceOverrides {
		const overrides: WorkspaceOverrides = {};

		for (const key of WORKSPACE_SCOPED_KEYS) {
			const effValue = (effective as any)[key];
			const globalValue = (this.plugin.settings as any)[key];

			// fluentFilterState is workspace-only. Always persist it per-workspace when defined.
			if (key === "fluentFilterState") {
				if (effValue !== undefined) {
					overrides[key] = structuredClone(effValue);
				}
				continue;
			}

			if (JSON.stringify(effValue) !== JSON.stringify(globalValue)) {
				overrides[key] = structuredClone(effValue);
			}
		}

		return overrides;
	}

	// Normalize overrides (remove ones identical to global)
	private normalizeOverrides(): void {
		const config = this.getWorkspacesConfig();

		for (const id of config.order) {
			if (id === config.defaultWorkspaceId) continue;

			const workspace = config.byId[id];
			if (!workspace.settings) continue;

			for (const key of WORKSPACE_SCOPED_KEYS) {
				if (workspace.settings[key] !== undefined) {
					const globalValue = (this.plugin.settings as any)[key];
					if (
						JSON.stringify(workspace.settings[key]) ===
						JSON.stringify(globalValue)
					) {
						delete workspace.settings[key];
					}
				}
			}
		}
	}

	// Clear the effective cache
	public clearCache(): void {
		this.effectiveCache.clear();
	}

	// Get all workspaces
	public getAllWorkspaces(): WorkspaceData[] {
		const config = this.getWorkspacesConfig();
		return config.order
			.map((id) => config.byId[id])
			.filter((ws) => ws !== undefined);
	}

	// Get workspace by ID
	public getWorkspace(id: string): WorkspaceData | undefined {
		const config = this.getWorkspacesConfig();
		return config.byId[id];
	}

	// Get active workspace
	public getActiveWorkspace(): WorkspaceData {
		const config = this.getWorkspacesConfig();
		const activeId = config.activeWorkspaceId || config.defaultWorkspaceId;
		return config.byId[activeId] || config.byId[config.defaultWorkspaceId];
	}

	// Set active workspace
	public async setActiveWorkspace(workspaceId: string): Promise<void> {
		console.log("[TG-WORKSPACE] setActiveWorkspace:start", {
			from: this.getActiveWorkspace()?.id,
			to: workspaceId,
		});

		const config = this.getWorkspacesConfig();

		if (!config.byId[workspaceId]) {
			new Notice(`Workspace not found. Using default workspace.`);
			workspaceId = config.defaultWorkspaceId;
		}

		if (config.activeWorkspaceId === workspaceId) {
			console.log(
				"[TG-WORKSPACE] setActiveWorkspace:noop (already active)",
				{ id: workspaceId },
			);
			return; // Already active
		}

		config.activeWorkspaceId = workspaceId;
		this.clearCache();

		await this.plugin.saveSettings();

		console.log("[TG-WORKSPACE] setActiveWorkspace:done", {
			active: config.activeWorkspaceId,
		});

		emitWorkspaceSwitched(this.app, workspaceId);
	}

	// Create new workspace (cloned from current or default)
	public async createWorkspace(
		name: string,
		baseWorkspaceId?: string,
		icon?: string,
		color?: string,
	): Promise<WorkspaceData> {
		const config = this.getWorkspacesConfig();
		const id = this.generateId();

		// Use current active workspace as base if not specified
		const baseId =
			baseWorkspaceId ||
			config.activeWorkspaceId ||
			config.defaultWorkspaceId;
		const baseWorkspace = config.byId[baseId];

		// Clone settings from base workspace (if not default)
		let settings: WorkspaceOverrides = {};
		if (baseId !== config.defaultWorkspaceId && baseWorkspace?.settings) {
			settings = structuredClone(baseWorkspace.settings);
		} else if (baseId === config.defaultWorkspaceId) {
			// Creating from default means starting with current global values as-is
			settings = {};
		}

		const newWorkspace: WorkspaceData = {
			id,
			name,
			updatedAt: Date.now(),
			settings,
		};

		// Add icon if provided, otherwise inherit from base workspace if cloning
		if (icon) {
			newWorkspace.icon = icon;
		} else if (
			baseWorkspace?.icon &&
			baseId !== config.defaultWorkspaceId
		) {
			newWorkspace.icon = baseWorkspace.icon;
		}

		// Add color if provided, otherwise inherit from base workspace if cloning
		if (color) {
			newWorkspace.color = color;
		} else if (
			baseWorkspace?.color &&
			baseId !== config.defaultWorkspaceId
		) {
			newWorkspace.color = baseWorkspace.color;
		}

		config.byId[id] = newWorkspace;
		config.order.push(id);

		await this.plugin.saveSettings();
		emitWorkspaceCreated(this.app, id, baseId);

		return newWorkspace;
	}

	// Delete workspace
	public async deleteWorkspace(workspaceId: string): Promise<void> {
		const config = this.getWorkspacesConfig();

		// Cannot delete default workspace
		if (workspaceId === config.defaultWorkspaceId) {
			new Notice("Cannot delete the default workspace");
			return;
		}

		if (!config.byId[workspaceId]) {
			return; // Already doesn't exist
		}

		// Remove from config
		delete config.byId[workspaceId];
		const orderIndex = config.order.indexOf(workspaceId);
		if (orderIndex !== -1) {
			config.order.splice(orderIndex, 1);
		}

		// If this was the active workspace, switch to default
		if (config.activeWorkspaceId === workspaceId) {
			config.activeWorkspaceId = config.defaultWorkspaceId;
			emitWorkspaceSwitched(this.app, config.defaultWorkspaceId);
		}

		this.clearCache();
		await this.plugin.saveSettings();
		emitWorkspaceDeleted(this.app, workspaceId);
	}

	// Rename workspace
	public async renameWorkspace(
		workspaceId: string,
		newName: string,
		icon?: string,
		color?: string,
	): Promise<void> {
		const config = this.getWorkspacesConfig();
		const workspace = config.byId[workspaceId];

		if (!workspace) {
			return;
		}

		workspace.name = newName;
		if (icon !== undefined) {
			workspace.icon = icon;
		}
		if (color !== undefined) {
			workspace.color = color;
		}
		workspace.updatedAt = Date.now();

		await this.plugin.saveSettings();
		emitWorkspaceRenamed(this.app, workspaceId, newName);
	}

	// Save overrides for a workspace
	public async saveOverrides(
		workspaceId: string,
		effective: EffectiveSettings,
	): Promise<void> {
		const config = this.getWorkspacesConfig();

		// Cannot save overrides to default workspace
		if (workspaceId === config.defaultWorkspaceId) {
			// For default, write directly to global settings EXCEPT fluentFilterState which is workspace-only
			const changedKeys: string[] = [];
			for (const key of WORKSPACE_SCOPED_KEYS) {
				if (
					effective[key] !== undefined &&
					key !== "fluentFilterState"
				) {
					(this.plugin.settings as any)[key] = structuredClone(
						effective[key],
					);
					changedKeys.push(key);
				}
			}
			// Handle fluentFilterState specially for default workspace
			if (effective.fluentFilterState !== undefined) {
				const ws = config.byId[workspaceId];
				ws.settings = (ws.settings || {}) as any;
				(ws.settings as any).fluentFilterState = structuredClone(
					effective.fluentFilterState,
				);
				ws.updatedAt = Date.now();
				changedKeys.push("fluentFilterState");
			}
			console.log("[TG-WORKSPACE] saveOverrides(default)", {
				workspaceId,
				changedKeys,
			});
			this.clearCache();
			await this.plugin.saveSettings();
			// Emit overrides saved for UI to react; also emit SETTINGS_CHANGED for global changes
			emitWorkspaceOverridesSaved(
				this.app,
				workspaceId,
				changedKeys.length ? changedKeys : undefined,
			);
			emit(this.app, Events.SETTINGS_CHANGED);
			return;
		}

		const workspace = config.byId[workspaceId];
		if (!workspace) {
			return;
		}

		// Calculate overrides
		const overrides = this.toOverrides(effective);
		const changedKeys = Object.keys(overrides);

		console.log("[TG-WORKSPACE] saveOverrides", {
			workspaceId,
			changedKeys,
		});
		workspace.settings = overrides;
		workspace.updatedAt = Date.now();

		this.clearCache();
		await this.plugin.saveSettings();

		emitWorkspaceOverridesSaved(this.app, workspaceId, changedKeys);
		emit(this.app, Events.SETTINGS_CHANGED);
	}

	// Save overrides quietly without triggering SETTINGS_CHANGED event
	public async saveOverridesQuietly(
		workspaceId: string,
		effective: EffectiveSettings,
	): Promise<void> {
		const config = this.getWorkspacesConfig();

		// Cannot save overrides to default workspace
		if (workspaceId === config.defaultWorkspaceId) {
			// For default, write directly to global settings EXCEPT fluentFilterState which is workspace-only
			for (const key of WORKSPACE_SCOPED_KEYS) {
				if (
					effective[key] !== undefined &&
					key !== "fluentFilterState"
				) {
					(this.plugin.settings as any)[key] = structuredClone(
						effective[key],
					);
				}
			}
			// Handle fluentFilterState specially for default workspace (store under workspace.settings)
			if (effective.fluentFilterState !== undefined) {
				const ws = config.byId[workspaceId];
				ws.settings = (ws.settings || {}) as any;
				(ws.settings as any).fluentFilterState = structuredClone(
					effective.fluentFilterState,
				);
				ws.updatedAt = Date.now();
			}
			console.log("[TG-WORKSPACE] saveOverridesQuietly(default)", {
				workspaceId,
				keys: WORKSPACE_SCOPED_KEYS.filter(
					(k) => (effective as any)[k] !== undefined,
				),
			});
			this.clearCache();
			await this.plugin.saveSettings();
			return;
		}

		const workspace = config.byId[workspaceId];
		if (!workspace) {
			return;
		}

		// Calculate overrides
		const overrides = this.toOverrides(effective);
		console.log("[TG-WORKSPACE] saveOverridesQuietly", {
			workspaceId,
			keys: Object.keys(overrides),
		});

		workspace.settings = overrides;
		workspace.updatedAt = Date.now();

		this.clearCache();
		await this.plugin.saveSettings();

		// Don't emit events to avoid triggering reload loops
	}

	// Reset workspace overrides
	public async resetOverrides(workspaceId: string): Promise<void> {
		const config = this.getWorkspacesConfig();

		// Cannot reset default workspace
		if (workspaceId === config.defaultWorkspaceId) {
			return;
		}

		const workspace = config.byId[workspaceId];
		if (!workspace) {
			return;
		}

		workspace.settings = {};
		workspace.updatedAt = Date.now();

		this.clearCache();
		await this.plugin.saveSettings();

		emitWorkspaceReset(this.app, workspaceId);
		emit(this.app, Events.SETTINGS_CHANGED);
	}

	// Set default workspace (change which one is default)
	public async setDefaultWorkspace(workspaceId: string): Promise<void> {
		const config = this.getWorkspacesConfig();

		if (!config.byId[workspaceId]) {
			return;
		}

		if (config.defaultWorkspaceId === workspaceId) {
			return; // Already default
		}

		// The old default workspace needs to get current global settings as overrides
		// The new default workspace's overrides become the new global settings

		const oldDefaultId = config.defaultWorkspaceId;
		const newDefaultWorkspace = config.byId[workspaceId];

		// Save current global as overrides for old default
		const currentGlobalAsOverrides: WorkspaceOverrides = {};
		for (const key of WORKSPACE_SCOPED_KEYS) {
			const globalValue = (this.plugin.settings as any)[key];
			if (globalValue !== undefined) {
				currentGlobalAsOverrides[key] = structuredClone(globalValue);
			}
		}

		// Apply new default's overrides to global
		if (newDefaultWorkspace.settings) {
			this.mergeIntoGlobal(newDefaultWorkspace.settings);
		}

		// Set old default's overrides
		config.byId[oldDefaultId].settings = currentGlobalAsOverrides;

		// Clear new default's overrides
		newDefaultWorkspace.settings = {};

		// Update default ID
		config.defaultWorkspaceId = workspaceId;

		// Normalize all overrides
		this.normalizeOverrides();

		this.clearCache();
		await this.plugin.saveSettings();

		emitDefaultWorkspaceChanged(this.app, workspaceId);
		emit(this.app, Events.SETTINGS_CHANGED);
	}

	// Generate unique ID
	private generateId(): string {
		return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	// Reorder workspaces
	public async reorderWorkspaces(newOrder: string[]): Promise<void> {
		const config = this.getWorkspacesConfig();

		// Validate that all IDs exist and default is first
		const validOrder = newOrder.filter((id) => config.byId[id]);

		// Ensure default is always first
		const defaultIndex = validOrder.indexOf(config.defaultWorkspaceId);
		if (defaultIndex > 0) {
			validOrder.splice(defaultIndex, 1);
			validOrder.unshift(config.defaultWorkspaceId);
		} else if (defaultIndex === -1) {
			validOrder.unshift(config.defaultWorkspaceId);
		}

		config.order = validOrder;
		await this.plugin.saveSettings();
	}

	// Check if a workspace is the default
	public isDefaultWorkspace(workspaceId: string): boolean {
		const config = this.getWorkspacesConfig();
		return workspaceId === config.defaultWorkspaceId;
	}

	// Export workspace configuration
	public exportWorkspace(workspaceId: string): string | null {
		const workspace = this.getWorkspace(workspaceId);
		if (!workspace) return null;

		const exportData = {
			name: workspace.name,
			settings: workspace.settings,
			exportedAt: Date.now(),
			version: 1,
		};

		return JSON.stringify(exportData, null, 2);
	}

	// Import workspace configuration
	public async importWorkspace(
		jsonData: string,
		name?: string,
	): Promise<WorkspaceData | null> {
		try {
			const importData = JSON.parse(jsonData);
			const workspaceName =
				name || importData.name || "Imported Workspace";
			const settings = importData.settings || {};

			const newWorkspace = await this.createWorkspace(workspaceName);
			newWorkspace.settings = settings;

			await this.plugin.saveSettings();
			return newWorkspace;
		} catch (e) {
			new Notice("Failed to import workspace configuration");
			console.error("Workspace import error:", e);
			return null;
		}
	}

	// Module visibility methods

	/**
	 * Ensure hiddenModules structure is fully initialized
	 * @param workspace - The workspace to initialize
	 * @returns The initialized hiddenModules object
	 */
	private ensureHiddenModulesInitialized(
		workspace: WorkspaceData,
	): Required<HiddenModulesConfig> {
		if (!workspace.settings) {
			workspace.settings = {};
		}
		if (!workspace.settings.hiddenModules) {
			workspace.settings.hiddenModules = {
				views: [],
				sidebarComponents: [],
				features: [],
			};
		}
		if (!workspace.settings.hiddenModules.views) {
			workspace.settings.hiddenModules.views = [];
		}
		if (!workspace.settings.hiddenModules.sidebarComponents) {
			workspace.settings.hiddenModules.sidebarComponents = [];
		}
		if (!workspace.settings.hiddenModules.features) {
			workspace.settings.hiddenModules.features = [];
		}
		return workspace.settings
			.hiddenModules as Required<HiddenModulesConfig>;
	}

	/**
	 * Check if a view is hidden in the specified workspace
	 * @param viewId - The view ID to check
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 * @returns true if the view is hidden
	 */
	public isViewHidden(viewId: string, workspaceId?: string): boolean {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace?.settings?.hiddenModules?.views) {
			return false;
		}

		return workspace.settings.hiddenModules.views.includes(viewId);
	}

	/**
	 * Check if a sidebar component is hidden in the specified workspace
	 * @param componentId - The sidebar component ID to check
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 * @returns true if the sidebar component is hidden
	 */
	public isSidebarComponentHidden(
		componentId:
			| "projects-list"
			| "tags-list"
			| "view-switcher"
			| "top-views"
			| "bottom-views",
		workspaceId?: string,
	): boolean {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace?.settings?.hiddenModules?.sidebarComponents) {
			return false;
		}

		return workspace.settings.hiddenModules.sidebarComponents.includes(
			componentId,
		);
	}

	/**
	 * Check if a feature component is hidden in the specified workspace
	 * @param featureId - The feature component ID to check
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 * @returns true if the feature component is hidden
	 */
	public isFeatureHidden(
		featureId:
			| "details-panel"
			| "quick-capture"
			| "filter"
			| "progress-bar"
			| "task-mark",
		workspaceId?: string,
	): boolean {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace?.settings?.hiddenModules?.features) {
			return false;
		}

		return workspace.settings.hiddenModules.features.includes(featureId);
	}

	/**
	 * Get all visible views for the specified workspace
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 * @returns Array of view IDs that are not hidden
	 */
	public getVisibleViews(workspaceId?: string): string[] {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		const hiddenViews = workspace?.settings?.hiddenModules?.views || [];
		const allViews = this.plugin.settings.viewConfiguration.map(
			(v) => v.id,
		);

		return allViews.filter((viewId) => !hiddenViews.includes(viewId));
	}

	/**
	 * Toggle view visibility in a workspace
	 * @param viewId - The view ID to toggle
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 */
	public async toggleViewVisibility(
		viewId: string,
		workspaceId?: string,
	): Promise<void> {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace) return;

		// Ensure complete initialization and get the initialized object
		const hiddenModules = this.ensureHiddenModulesInitialized(workspace);

		const index = hiddenModules.views.indexOf(viewId);
		if (index > -1) {
			// Currently hidden, make visible
			hiddenModules.views.splice(index, 1);
		} else {
			// Currently visible, hide it
			hiddenModules.views.push(viewId);
		}

		workspace.updatedAt = Date.now();
		this.clearCache();
		await this.plugin.saveSettings();

		// Emit event to notify UI components
		emitWorkspaceOverridesSaved(this.app, workspace.id, ["hiddenModules"]);
	}

	/**
	 * Set hidden views for a workspace
	 * @param viewIds - Array of view IDs to hide
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 */
	public async setHiddenViews(
		viewIds: string[],
		workspaceId?: string,
	): Promise<void> {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace) return;

		// Ensure complete initialization and get the initialized object
		const hiddenModules = this.ensureHiddenModulesInitialized(workspace);
		hiddenModules.views = [...viewIds];

		workspace.updatedAt = Date.now();
		this.clearCache();
		await this.plugin.saveSettings();

		emitWorkspaceOverridesSaved(this.app, workspace.id, ["hiddenModules"]);
	}

	/**
	 * Set hidden sidebar components for a workspace
	 * @param componentIds - Array of sidebar component IDs to hide
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 */
	public async setHiddenSidebarComponents(
		componentIds: Array<
			| "projects-list"
			| "tags-list"
			| "view-switcher"
			| "top-views"
			| "bottom-views"
		>,
		workspaceId?: string,
	): Promise<void> {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace) return;

		// Ensure complete initialization and get the initialized object
		const hiddenModules = this.ensureHiddenModulesInitialized(workspace);
		hiddenModules.sidebarComponents = [...componentIds];

		workspace.updatedAt = Date.now();
		this.clearCache();
		await this.plugin.saveSettings();

		emitWorkspaceOverridesSaved(this.app, workspace.id, ["hiddenModules"]);
	}

	/**
	 * Set hidden features for a workspace
	 * @param featureIds - Array of feature IDs to hide
	 * @param workspaceId - Optional workspace ID, defaults to active workspace
	 */
	public async setHiddenFeatures(
		featureIds: Array<
			| "details-panel"
			| "quick-capture"
			| "filter"
			| "progress-bar"
			| "task-mark"
		>,
		workspaceId?: string,
	): Promise<void> {
		const workspace = workspaceId
			? this.getWorkspace(workspaceId)
			: this.getActiveWorkspace();

		if (!workspace) return;

		// Ensure complete initialization and get the initialized object
		const hiddenModules = this.ensureHiddenModulesInitialized(workspace);
		hiddenModules.features = [...featureIds];

		workspace.updatedAt = Date.now();
		this.clearCache();
		await this.plugin.saveSettings();

		emitWorkspaceOverridesSaved(this.app, workspace.id, ["hiddenModules"]);
	}
}
