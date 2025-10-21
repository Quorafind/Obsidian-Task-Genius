import { App, Component, Notice, debounce } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { RootFilterState } from "@/components/features/task/filter/ViewTaskFilter";
import { ViewMode } from "../components/FluentTopNavigation";

export interface WorkspaceFilterSnapshot {
	filters: any;
	selectedProject: string | undefined;
	advancedFilter: RootFilterState | null;
	liveFilterState: RootFilterState | null;
	viewMode: ViewMode;
	shouldClearSearch: boolean;
	activeViewId?: string;
}

export interface FilterSyncHandlers {
	setLiveFilterState: (state: RootFilterState | null) => void;
	setCurrentFilterState: (state: RootFilterState | null) => void;
	setViewPreferences: (payload: {
		filters: any;
		selectedProject: string | undefined;
		viewMode: ViewMode;
		clearSearch: boolean;
	}) => void;
	onAfterSync?: (snapshot: WorkspaceFilterSnapshot) => void;
}

interface FilterStatePersistPayload {
	workspaceId: string;
	viewId: string;
	activeViewId: string;
	filters: any;
	selectedProject: string | undefined;
	viewMode: ViewMode;
	searchQuery: string;
	advancedFilter: RootFilterState | null;
}

/**
 * FluentWorkspaceStateManager - Manages workspace state persistence
 *
 * Responsibilities:
 * - Save/restore workspace layout (filter state, view preferences)
 * - Workspace switching
 * - Filter state persistence to workspace overrides
 * - LocalStorage management for current workspace
 */
export class FluentWorkspaceStateManager extends Component {
	// Flag to prevent infinite loops during save
	private isSavingFilterState = false;

	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private getWorkspaceId: () => string,
		private getCurrentViewId: () => string,
		private getViewState: () => {
			filters: any;
			selectedProject: string | undefined;
			searchQuery: string;
			viewMode: ViewMode;
		},
		private getCurrentFilterState: () => RootFilterState | null,
		private getLiveFilterState: () => RootFilterState | null,
	) {
		super();
	}

	/**
	 * Save workspace layout (filter state and preferences)
	 */
	saveWorkspaceLayout(): void {
		const snapshot = this.captureFilterStateSnapshot();
		if (!snapshot) return;

		this.saveFilterStateToWorkspace(snapshot);

		this.app.saveLocalStorage(
			"task-genius-fluent-current-workspace",
			snapshot.workspaceId,
		);
	}

	/**
	 * Load workspace layout (filter state and preferences)
	 */
	loadWorkspaceLayout(): string | null {
		// Load current workspace from localStorage
		const savedCurrentWorkspace = this.app.loadLocalStorage(
			"task-genius-fluent-current-workspace",
		);

		if (savedCurrentWorkspace) {
			return savedCurrentWorkspace;
		}

		return null;
	}

	/**
	 * Apply workspace settings
	 */
	async applyWorkspaceSettings(): Promise<void> {
		const workspaceId = this.getWorkspaceId();
		if (!this.plugin.workspaceManager || !workspaceId) return;

		const settings =
			this.plugin.workspaceManager.getEffectiveSettings(workspaceId);

		// Workspace settings are now restored via restoreFilterStateFromWorkspace
		// This method is kept for future workspace-specific settings that are not filter-related
	}

	/**
	 * Switch to a different workspace
	 */
	async switchWorkspace(workspaceId: string): Promise<void> {
		// Save current workspace before switching
		this.saveWorkspaceLayout();

		// Update workspace ID will be handled by caller
		// This method just handles the save/restore logic
	}

	/**
	 * Capture a point-in-time snapshot of the filter state for persistence.
	 * @returns Snapshot payload or null if workspaceManager is unavailable
	 */
	public captureFilterStateSnapshot(): FilterStatePersistPayload | null {
		const workspaceId = this.getWorkspaceId();
		const viewId = this.getCurrentViewId();

		if (!this.plugin.workspaceManager || !workspaceId || !viewId) {
			return null;
		}

		const viewState = this.getViewState();
		const currentFilterState = this.getCurrentFilterState();

		return {
			workspaceId,
			viewId,
			activeViewId: viewId,
			filters: structuredClone(viewState.filters || {}),
			selectedProject: viewState.selectedProject,
			viewMode: viewState.viewMode,
			searchQuery: viewState.searchQuery,
			advancedFilter: currentFilterState
				? structuredClone(currentFilterState)
				: null,
		};
	}

	public getSavedActiveViewId(): string | null {
		const workspaceId = this.getWorkspaceId();

		if (!this.plugin.workspaceManager || !workspaceId) {
			return null;
		}

		const effective =
			this.plugin.workspaceManager.getEffectiveSettings(workspaceId);
		const active = (effective as any)?.fluentActiveViewId;
		return typeof active === "string" ? active : null;
	}

	/**
	 * Debounced worker that performs the actual save.
	 */
	private persistFilterState = debounce(
		(payload: FilterStatePersistPayload) => {
			if (!this.plugin.workspaceManager) {
				return;
			}

			const {
				workspaceId,
				viewId,
				activeViewId,
				filters,
				selectedProject,
				viewMode,
				searchQuery,
				advancedFilter,
			} = payload;

			const effectiveSettings =
				this.plugin.workspaceManager.getEffectiveSettings(workspaceId);

			if (!effectiveSettings.fluentFilterState) {
				effectiveSettings.fluentFilterState = {};
			}

			effectiveSettings.fluentFilterState[viewId] = {
				filters,
				selectedProject,
				advancedFilter,
				viewMode,
			};
			if (activeViewId) {
				effectiveSettings.fluentActiveViewId = activeViewId;
			}

			console.log("[FluentWorkspace] saveFilterStateToWorkspace", {
				workspaceId,
				viewId,
				activeViewId,
				searchQuery,
				selectedProject,
				hasAdvanced: !!advancedFilter,
				groups: (advancedFilter as any)?.filterGroups?.length ?? 0,
			});

			this.plugin.workspaceManager
				.saveOverridesQuietly(workspaceId, effectiveSettings)
				.then(() =>
					console.log("[FluentWorkspace] overrides saved quietly", {
						workspaceId,
						viewId,
					}),
				)
				.catch((e) => {
					console.error(
						"[FluentWorkspace] failed to save overrides",
						e,
					);
					new Notice(
						"Failed to save workspace state. Recent changes may be lost.",
					);
				});
		},
		500,
	);

	/**
	 * Save filter state to workspace (debounced to avoid infinite loops)
	 */
	public saveFilterStateToWorkspace(
		payload?: FilterStatePersistPayload,
	): void {
		const snapshot = payload ?? this.captureFilterStateSnapshot();
		if (!snapshot) return;

		this.persistFilterState(snapshot);
	}

	/**
	 * Save filter state immediately without debouncing.
	 * Used for critical saves like workspace switching.
	 * @param payload Optional snapshot to save, or captures current state if not provided
	 */
	public async saveFilterStateImmediately(
		payload?: FilterStatePersistPayload,
	): Promise<void> {
		const snapshot = payload ?? this.captureFilterStateSnapshot();
		if (!snapshot || !this.plugin.workspaceManager) {
			return;
		}

		const {
			workspaceId,
			viewId,
			activeViewId,
			filters,
			selectedProject,
			viewMode,
			advancedFilter,
		} = snapshot;

		const effectiveSettings =
			this.plugin.workspaceManager.getEffectiveSettings(workspaceId);

		if (!effectiveSettings.fluentFilterState) {
			effectiveSettings.fluentFilterState = {};
		}

		effectiveSettings.fluentFilterState[viewId] = {
			filters,
			selectedProject,
			advancedFilter,
			viewMode,
		};
		if (activeViewId) {
			effectiveSettings.fluentActiveViewId = activeViewId;
		}

		console.log("[FluentWorkspace] saveFilterStateImmediately", {
			workspaceId,
			viewId,
			activeViewId,
		});

		try {
			await this.plugin.workspaceManager.saveOverridesQuietly(
				workspaceId,
				effectiveSettings,
			);
			console.log("[FluentWorkspace] immediate save completed", {
				workspaceId,
				viewId,
			});
		} catch (e) {
			console.error("[FluentWorkspace] immediate save failed", e);
			new Notice(
				"Failed to save workspace state. Recent changes may be lost.",
			);
		}
	}

	/**
	 * Restore filter state from workspace
	 */
	restoreFilterStateFromWorkspace(): WorkspaceFilterSnapshot | null {
		const workspaceId = this.getWorkspaceId();
		if (!this.plugin.workspaceManager || !workspaceId) return null;

		const effectiveSettings =
			this.plugin.workspaceManager.getEffectiveSettings(workspaceId);
		const activeViewId =
			((effectiveSettings as any)?.fluentActiveViewId as
				| string
				| undefined) ?? this.getCurrentViewId();
		const viewId = activeViewId || this.getCurrentViewId();

		const saved = effectiveSettings.fluentFilterState?.[viewId] ?? null;

		if (saved) {
			const savedState = saved;

			return {
				filters: savedState.filters || {},
				selectedProject: savedState.selectedProject,
				advancedFilter: savedState.advancedFilter || null,
				liveFilterState: savedState.advancedFilter || null,
				viewMode: savedState.viewMode || "list",
				shouldClearSearch: true, // Always clear searchQuery on workspace restore
				activeViewId: viewId,
			};
		} else {
			// No saved state for this view in this workspace
			return {
				filters: {},
				selectedProject: undefined,
				advancedFilter: null,
				liveFilterState: null,
				viewMode: "list",
				shouldClearSearch: true,
				activeViewId: viewId,
			};
		}
	}

	/**
	 * Sync filter-related state with the provided handlers
	 */
	syncFilterState(
		snapshot: WorkspaceFilterSnapshot | null,
		handlers: FilterSyncHandlers,
	): void {
		if (!snapshot) return;

		const liveState =
			snapshot.liveFilterState ?? snapshot.advancedFilter ?? null;

		handlers.setLiveFilterState(liveState);
		handlers.setCurrentFilterState(snapshot.advancedFilter ?? null);
		handlers.setViewPreferences({
			filters: snapshot.filters || {},
			selectedProject: snapshot.selectedProject,
			viewMode: snapshot.viewMode,
			clearSearch: snapshot.shouldClearSearch,
		});

		handlers.onAfterSync?.(snapshot);
	}

	/**
	 * Get saved workspace ID from localStorage
	 */
	getSavedWorkspaceId(): string | null {
		return this.app.loadLocalStorage(
			"task-genius-fluent-current-workspace",
		);
	}

	/**
	 * Clear workspace state from localStorage
	 */
	clearWorkspaceState(): void {
		this.app.saveLocalStorage("task-genius-fluent-current-workspace", null);
	}

	/**
	 * Clean up on unload
	 */
	onunload(): void {
		// Save state before unload
		this.saveWorkspaceLayout();
		super.onunload();
	}
}
