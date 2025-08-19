import { App } from "obsidian";
import TaskProgressBarPlugin from "../../index";

/**
 * Utility functions for managing view mode state across the application
 */

/**
 * Get the global default view mode from plugin settings
 * @param plugin The TaskProgressBarPlugin instance
 * @returns true for tree view, false for list view
 */
export function getDefaultViewMode(plugin: TaskProgressBarPlugin): boolean {
	return plugin.settings.defaultViewMode === "tree";
}

/**
 * Get the saved view mode for a specific view from localStorage
 * @param app The Obsidian App instance
 * @param viewId The view identifier
 * @returns true for tree view, false for list view, null if not saved
 */
export function getSavedViewMode(app: App, viewId: string): boolean | null {
	const saved = app.loadLocalStorage(`task-genius:view-mode:${viewId}`);
	if (saved === null || saved === undefined) {
		return null;
	}
	return saved === "tree";
}

/**
 * Save the view mode for a specific view to localStorage
 * @param app The Obsidian App instance
 * @param viewId The view identifier
 * @param isTreeView true for tree view, false for list view
 */
export function saveViewMode(app: App, viewId: string, isTreeView: boolean): void {
	const modeString = isTreeView ? "tree" : "list";
	app.saveLocalStorage(`task-genius:view-mode:${viewId}`, modeString);
}

/**
 * Get the initial view mode for a view, considering saved state and global default
 * @param app The Obsidian App instance
 * @param plugin The TaskProgressBarPlugin instance
 * @param viewId The view identifier
 * @returns true for tree view, false for list view
 */
export function getInitialViewMode(
	app: App,
	plugin: TaskProgressBarPlugin,
	viewId: string
): boolean {
	// First check if there's a saved state for this specific view
	const savedMode = getSavedViewMode(app, viewId);
	if (savedMode !== null) {
		return savedMode;
	}

	// If no saved state, use the global default
	return getDefaultViewMode(plugin);
}
