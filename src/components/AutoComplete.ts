import {
	AbstractInputSuggest,
	App,
	prepareFuzzySearch,
	Scope,
	TFile,
} from "obsidian";
import TaskProgressBarPlugin from "../index";
import { QuickCaptureOptions } from "../editor-ext/quickCapture";

// Global cache for autocomplete data to avoid repeated expensive operations
interface GlobalAutoCompleteCache {
	tags: string[];
	projects: string[];
	contexts: string[];
	lastUpdate: number;
}

let globalCache: GlobalAutoCompleteCache | null = null;
const CACHE_DURATION = 30000; // 30 seconds

// Helper function to get cached data
function getCachedData(plugin: TaskProgressBarPlugin): GlobalAutoCompleteCache {
	const now = Date.now();

	if (!globalCache || now - globalCache.lastUpdate > CACHE_DURATION) {
		// Fetch fresh data
		const tags = Object.keys(plugin.app.metadataCache.getTags() || {}).map(
			(tag) => tag.substring(1) // Remove # prefix
		);

		const { projects, contexts } =
			plugin.taskManager?.getAvailableContextOrProjects() || {
				projects: [],
				contexts: [],
			};

		globalCache = {
			tags,
			projects,
			contexts,
			lastUpdate: now,
		};
	}

	return globalCache;
}

abstract class BaseSuggest<T> extends AbstractInputSuggest<T> {
	constructor(app: App, public inputEl: HTMLInputElement) {
		super(app, inputEl);
	}

	// Common method to render suggestions
	renderSuggestion(item: T, el: HTMLElement): void {
		el.setText(this.getSuggestionText(item));
	}

	// Common method to select suggestion
	selectSuggestion(item: T, evt: MouseEvent | KeyboardEvent): void {
		if (!this.inputEl) {
			console.warn("BaseSuggest: inputEl is undefined, cannot set value");
			this.close();
			return;
		}
		this.inputEl.value = this.getSuggestionValue(item);
		this.inputEl.trigger("input"); // Trigger change event
		this.close();
	}

	// Abstract methods to be implemented by subclasses
	abstract getSuggestionText(item: T): string;
	abstract getSuggestionValue(item: T): string;
}

class CustomSuggest extends BaseSuggest<string> {
	protected availableChoices: string[] = [];

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		availableChoices: string[]
	) {
		super(app, inputEl);
		this.availableChoices = availableChoices;
	}

	getSuggestions(query: string): string[] {
		if (!query) {
			return this.availableChoices.slice(0, 100); // Limit initial suggestions
		}
		const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
		return this.availableChoices
			.filter(
				(
					cmd: string // Add type to cmd
				) => fuzzySearch(cmd.toLowerCase()) // Call the returned function
			)
			.slice(0, 100);
	}

	getSuggestionText(item: string): string {
		return item;
	}

	getSuggestionValue(item: string): string {
		return item;
	}
}

/**
 * ProjectSuggest - Provides autocomplete for project names
 */
export class ProjectSuggest extends CustomSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin
	) {
		// Get cached project list
		const cachedData = getCachedData(plugin);
		super(app, inputEl, cachedData.projects);
	}
}

/**
 * ContextSuggest - Provides autocomplete for context names
 */
export class ContextSuggest extends CustomSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin
	) {
		// Get cached context list
		const cachedData = getCachedData(plugin);
		super(app, inputEl, cachedData.contexts);
	}
}

/**
 * TagSuggest - Provides autocomplete for tag names
 */
export class TagSuggest extends CustomSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin
	) {
		// Get cached tag list
		const cachedData = getCachedData(plugin);
		super(app, inputEl, cachedData.tags);
	}

	// Override getSuggestions to handle comma-separated tags
	getSuggestions(query: string): string[] {
		const parts = query.split(",");
		const currentTagInput = parts[parts.length - 1].trim();

		if (!currentTagInput) {
			return this.availableChoices.slice(0, 100);
		}

		const fuzzySearch = prepareFuzzySearch(currentTagInput.toLowerCase());
		return this.availableChoices
			.filter((tag) => fuzzySearch(tag.toLowerCase()))
			.slice(0, 100);
	}

	// Override to add # prefix and keep previous tags
	getSuggestionValue(item: string): string {
		const currentValue = this.inputEl.value;
		const parts = currentValue.split(",");

		// Replace the last part with the selected tag
		parts[parts.length - 1] = `#${item}`;

		// Join back with commas and add a new comma for the next tag
		return `${parts.join(",")},`;
	}

	// Override to display full tag
	getSuggestionText(item: string): string {
		return `#${item}`;
	}
}

export class SingleFolderSuggest extends CustomSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin
	) {
		const folders = app.vault.getAllFolders();
		const paths = folders.map((file) => file.path);
		super(app, inputEl, ["/", ...paths]);
	}
}

/**
 * PathSuggest - Provides autocomplete for file paths
 */
export class FolderSuggest extends CustomSuggest {
	private plugin: TaskProgressBarPlugin;
	private outputType: "single" | "multiple";

	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin,
		outputType: "single" | "multiple" = "multiple"
	) {
		// Get all markdown files in the vault
		const folders = app.vault.getAllFolders();
		const paths = folders.map((file) => file.path);
		super(app, inputEl, paths);
		this.plugin = plugin;
		this.outputType = outputType;
	}

	// Override getSuggestions to handle comma-separated paths
	getSuggestions(query: string): string[] {
		if (this.outputType === "multiple") {
			const parts = query.split(",");
			const currentPathInput = parts[parts.length - 1].trim();

			if (!currentPathInput) {
				return this.availableChoices.slice(0, 20);
			}

			const fuzzySearch = prepareFuzzySearch(
				currentPathInput.toLowerCase()
			);
			return this.availableChoices
				.filter((path) => fuzzySearch(path.toLowerCase()))
				.sort((a, b) => {
					// Sort by path length (shorter paths first)
					// This helps prioritize files in the root or with shorter paths
					return a.length - b.length;
				})
				.slice(0, 20);
		} else {
			// Single mode - search the entire query
			if (!query.trim()) {
				return this.availableChoices.slice(0, 20);
			}

			const fuzzySearch = prepareFuzzySearch(query.toLowerCase());
			return this.availableChoices
				.filter((path) => fuzzySearch(path.toLowerCase()))
				.sort((a, b) => {
					// Sort by path length (shorter paths first)
					// This helps prioritize files in the root or with shorter paths
					return a.length - b.length;
				})
				.slice(0, 20);
		}
	}

	// Override to display the path with folder structure
	getSuggestionText(item: string): string {
		return item;
	}

	// Override to keep previous paths and add the selected one
	getSuggestionValue(item: string): string {
		if (this.outputType === "multiple") {
			const currentValue = this.inputEl.value;
			const parts = currentValue.split(",");

			// Replace the last part with the selected path
			parts[parts.length - 1] = item;

			// Join back with commas but don't add trailing comma
			return parts.join(",");
		} else {
			// Single mode - just return the selected item
			return item;
		}
	}
}

/**
 * ImageSuggest - Provides autocomplete for image paths
 */
export class ImageSuggest extends CustomSuggest {
	constructor(
		app: App,
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin
	) {
		// Get all images in the vault
		const images = app.vault
			.getFiles()
			.filter(
				(file) =>
					file.extension === "png" ||
					file.extension === "jpg" ||
					file.extension === "jpeg" ||
					file.extension === "gif" ||
					file.extension === "svg" ||
					file.extension === "webp"
			);
		const paths = images.map((file) => file.path);
		super(app, inputEl, paths);
	}
}

/**
 * A class that provides file suggestions for the quick capture target field
 */
export class FileSuggest extends AbstractInputSuggest<TFile> {
	private currentTarget: string = "Quick Capture.md";
	scope: Scope;
	onFileSelected: (file: TFile) => void;

	constructor(
		app: App,
		inputEl: HTMLInputElement | HTMLDivElement,
		options: QuickCaptureOptions,
		onFileSelected?: (file: TFile) => void
	) {
		super(app, inputEl);
		this.suggestEl.addClass("quick-capture-file-suggest");
		this.currentTarget = options.targetFile || "Quick Capture.md";
		this.onFileSelected =
			onFileSelected ||
			((file: TFile) => {
				this.setValue(file.path);
			});

		// Register Alt+X hotkey to focus target input
		this.scope.register(["Alt"], "x", (e: KeyboardEvent) => {
			inputEl.focus();
			return true;
		});

		// Set initial value
		this.setValue(this.currentTarget);

		// Register callback for selection
		this.onSelect((file, evt) => {
			this.onFileSelected(file);
		});
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerCaseQuery = query.toLowerCase();

		// Use fuzzy search for better matching
		const fuzzySearcher = prepareFuzzySearch(lowerCaseQuery);

		// Filter and sort results
		return files
			.map((file) => {
				const result = fuzzySearcher(file.path);
				return result ? { file, score: result.score } : null;
			})
			.filter(
				(match): match is { file: TFile; score: number } =>
					match !== null
			)
			.sort((a, b) => {
				// Sort by score (higher is better)
				return b.score - a.score;
			})
			.map((match) => match.file)
			.slice(0, 10); // Limit results
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(file.path);
		this.onFileSelected(file);
		this.close();
	}
}

/**
 * SimpleFileSuggest - Provides autocomplete for file paths
 */
export class SimpleFileSuggest extends AbstractInputSuggest<TFile> {
	private onFileSelected: (file: TFile) => void;

	constructor(
		inputEl: HTMLInputElement,
		plugin: TaskProgressBarPlugin,
		onFileSelected?: (file: TFile) => void
	) {
		super(plugin.app, inputEl);
		this.onFileSelected = onFileSelected || (() => {});
	}

	getSuggestions(query: string): TFile[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerCaseQuery = query.toLowerCase();

		// Use fuzzy search for better matching
		const fuzzySearcher = prepareFuzzySearch(lowerCaseQuery);

		// Filter and sort results
		return files
			.map((file) => {
				const result = fuzzySearcher(file.path);
				return result ? { file, score: result.score } : null;
			})
			.filter(
				(match): match is { file: TFile; score: number } =>
					match !== null
			)
			.sort((a, b) => {
				// Sort by score (higher is better)
				return b.score - a.score;
			})
			.map((match) => match.file)
			.slice(0, 10); // Limit results
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}

	selectSuggestion(file: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.setValue(file.path);
		this.onFileSelected?.(file);
		this.close();
	}
}
