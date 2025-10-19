import { EditorView } from "@codemirror/view";

import TaskProgressBarPlugin from ".";
import {
	App,
	editorInfoField,
	MarkdownPostProcessorContext,
	TFile,
	Vault,
} from "obsidian";

// Helper function to check if progress bars should be hidden
export function shouldHideProgressBarInPreview(
	plugin: TaskProgressBarPlugin,
	ctx: MarkdownPostProcessorContext,
): boolean {
	if (!plugin.settings.hideProgressBarBasedOnConditions) {
		return false;
	}

	const abstractFile = ctx.sourcePath
		? plugin.app.vault.getFileByPath(ctx.sourcePath)
		: null;
	if (!abstractFile) {
		return false;
	}

	// Check if it's a file and not a folder
	if (!(abstractFile instanceof TFile)) {
		return false;
	}

	const file = abstractFile as TFile;

	// Check folder paths
	if (plugin.settings.hideProgressBarFolders) {
		const folders = plugin.settings.hideProgressBarFolders
			.split(",")
			.map((f) => f.trim());
		const filePath = file.path;

		for (const folder of folders) {
			if (folder && filePath.startsWith(folder)) {
				return true;
			}
		}
	}

	// Check tags
	if (plugin.settings.hideProgressBarTags) {
		const tags = plugin.settings.hideProgressBarTags
			.split(",")
			.map((t) => t.trim());
		const fileCache = plugin.app.metadataCache.getFileCache(file);

		if (fileCache && fileCache.tags) {
			for (const tag of tags) {
				if (fileCache.tags.some((t) => t.tag === "#" + tag)) {
					return true;
				}
			}
		}
	}

	// Check metadata
	if (plugin.settings.hideProgressBarMetadata) {
		const metadataCache = plugin.app.metadataCache.getFileCache(file);

		if (metadataCache && metadataCache.frontmatter) {
			// Parse the metadata string (format: "key: value")
			const key = plugin.settings.hideProgressBarMetadata;
			if (key && metadataCache.frontmatter[key] !== undefined) {
				return !!metadataCache.frontmatter[key];
			}
		}
	}

	return false;
}

// Helper function to check if progress bars should be hidden
export function shouldHideProgressBarInLivePriview(
	plugin: TaskProgressBarPlugin,
	view: EditorView,
): boolean {
	// If progress display mode is set to "none", hide progress bars
	if (plugin.settings.progressBarDisplayMode === "none") {
		return true;
	}

	if (!plugin.settings.hideProgressBarBasedOnConditions) {
		return false;
	}

	// Get the current file
	const editorInfo = view.state.field(editorInfoField);
	if (!editorInfo) {
		return false;
	}

	const file = editorInfo.file;
	if (!file) {
		return false;
	}

	// Check folder paths
	if (plugin.settings.hideProgressBarFolders) {
		const folders = plugin.settings.hideProgressBarFolders
			.split(",")
			.map((f) => f.trim());
		const filePath = file.path;

		for (const folder of folders) {
			if (folder && filePath.startsWith(folder)) {
				return true;
			}
		}
	}

	// Check tags
	if (plugin.settings.hideProgressBarTags) {
		const tags = plugin.settings.hideProgressBarTags
			.split(",")
			.map((t) => t.trim());

		// Try to get cache for tags
		const fileCache = plugin.app.metadataCache.getFileCache(file);
		if (fileCache && fileCache.tags) {
			for (const tag of tags) {
				if (fileCache.tags.some((t) => t.tag === "#" + tag)) {
					return true;
				}
			}
		}
	}

	// Check metadata
	if (plugin.settings.hideProgressBarMetadata) {
		const metadataCache = plugin.app.metadataCache.getFileCache(file);

		if (metadataCache && metadataCache.frontmatter) {
			// Parse the metadata string (format: "key: value")
			const key = plugin.settings.hideProgressBarMetadata;
			if (key && key in metadataCache.frontmatter) {
				return !!metadataCache.frontmatter[key];
			}
		}
	}

	return false;
}

/**
 * Get tab size from vault configuration
 */
export function getTabSize(app: App): number {
	try {
		const vaultConfig = app.vault as any;
		const useTab =
			vaultConfig.getConfig?.("useTab") === undefined ||
			vaultConfig.getConfig?.("useTab") === true;
		return useTab
			? (vaultConfig.getConfig?.("tabSize") || 4) / 4
			: vaultConfig.getConfig?.("tabSize") || 4;
	} catch (e) {
		console.error("Error getting tab size:", e);
		return 4; // Default tab size
	}
}

/**
 * Build indent string based on tab size and using tab or space
 */
export function buildIndentString(app: App): string {
	try {
		const vaultConfig = app.vault as Vault;
		const useTab =
			vaultConfig.getConfig?.("useTab") === undefined ||
			vaultConfig.getConfig?.("useTab") === true;
		const tabSize = getTabSize(app);
		return useTab ? "\t" : " ".repeat(tabSize);
	} catch (e) {
		console.error("Error building indent string:", e);
		return "";
	}
}

export interface TasksApiV1 {
	executeToggleTaskDoneCommand: (taskLine: string, filePath: string) => string;
}

export function getTasksAPI(
	plugin: TaskProgressBarPlugin,
): TasksApiV1 | null {
	const tasksPlugin = ((plugin.app as any)?.plugins?.plugins ?? {})[
		"obsidian-tasks-plugin"
	] as undefined | { _loaded?: boolean; apiV1?: unknown };

	if (!tasksPlugin || !tasksPlugin._loaded) {
		return null;
	}

	const api = tasksPlugin.apiV1 as TasksApiV1 | undefined;
	if (!api || typeof api.executeToggleTaskDoneCommand !== "function") {
		return null;
	}

	return api;
}

/**
 * Format a date using a template string
 * @param date - The date to format
 * @param format - The format string
 * @returns The formatted date string
 */
export function formatDate(date: Date, format: string): string {
	const tokens: Record<string, () => string> = {
		YYYY: () => date.getFullYear().toString(),
		MM: () => (date.getMonth() + 1).toString().padStart(2, "0"),
		DD: () => date.getDate().toString().padStart(2, "0"),
		HH: () => date.getHours().toString().padStart(2, "0"),
		mm: () => date.getMinutes().toString().padStart(2, "0"),
		ss: () => date.getSeconds().toString().padStart(2, "0"),
	};

	let result = format;
	for (const [token, func] of Object.entries(tokens)) {
		result = result.replace(token, func());
	}

	return result;
}
