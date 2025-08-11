import { TFile, MetadataCache } from "obsidian";
import { TaskTimerSettings } from "../common/setting-definition";

/**
 * Service for detecting whether task timer functionality should be enabled
 * for a specific file based on metadata conditions
 */
export class TaskTimerMetadataDetector {
	private settings: TaskTimerSettings;
	private metadataCache: MetadataCache;

	constructor(settings: TaskTimerSettings, metadataCache: MetadataCache) {
		this.settings = settings;
		this.metadataCache = metadataCache;
	}

	/**
	 * Check if task timer is enabled for the given file
	 * @param file The file to check
	 * @returns true if task timer should be enabled for this file
	 */
	isTaskTimerEnabled(file: TFile): boolean {
		if (!this.settings.enabled) {
			return false;
		}

		if (!file) {
			return false;
		}

		// Check all enabled detection methods
		return (
			this.checkFrontmatterCondition(file) ||
			this.checkFolderCondition(file) ||
			this.checkTagCondition(file)
		);
	}

	/**
	 * Check if frontmatter condition is met
	 * @param file The file to check
	 * @returns true if frontmatter condition is satisfied
	 */
	checkFrontmatterCondition(file: TFile): boolean {
		if (!this.settings.metadataDetection.frontmatter) {
			return false;
		}

		const fileCache = this.metadataCache.getFileCache(file);
		if (!fileCache || !fileCache.frontmatter) {
			return false;
		}

		const frontmatterKey = this.settings.metadataDetection.frontmatter;
		const frontmatterValue = fileCache.frontmatter[frontmatterKey];

		// Check if the frontmatter field exists and is truthy
		return Boolean(frontmatterValue);
	}

	/**
	 * Check if folder condition is met
	 * @param file The file to check
	 * @returns true if folder condition is satisfied
	 */
	checkFolderCondition(file: TFile): boolean {
		const folders = this.settings.metadataDetection.folders;
		if (!folders || folders.length === 0) {
			return false;
		}

		const filePath = file.path;

		// Check if file path starts with any of the configured folders
		return folders.some((folder) => {
			if (!folder.trim()) {
				return false;
			}
			// Normalize folder path (ensure it ends with /)
			const normalizedFolder = folder.endsWith("/") ? folder : folder + "/";
			return filePath.startsWith(normalizedFolder) || filePath.startsWith(folder);
		});
	}

	/**
	 * Check if tag condition is met
	 * @param file The file to check
	 * @returns true if tag condition is satisfied
	 */
	checkTagCondition(file: TFile): boolean {
		const tags = this.settings.metadataDetection.tags;
		if (!tags || tags.length === 0) {
			return false;
		}

		const fileCache = this.metadataCache.getFileCache(file);
		if (!fileCache || !fileCache.tags) {
			return false;
		}

		const fileTags = fileCache.tags.map((t) => t.tag.replace("#", ""));

		// Check if any of the configured tags exist in the file
		return tags.some((configTag) => {
			const normalizedConfigTag = configTag.replace("#", "");
			return fileTags.includes(normalizedConfigTag);
		});
	}

	/**
	 * Update settings for this detector instance
	 * @param settings New settings to use
	 */
	updateSettings(settings: TaskTimerSettings): void {
		this.settings = settings;
	}
}