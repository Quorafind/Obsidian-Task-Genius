/**
 * File Filter Manager
 *
 * Manages file and folder filtering rules for task indexing.
 * Provides efficient path matching and caching mechanisms.
 */

import { TFile, TFolder } from "obsidian";
import { FilterMode } from "../common/setting-definition";

/**
 * Filter rule types
 */
export interface FilterRule {
	type: "file" | "folder" | "pattern";
	path: string;
	enabled: boolean;
	scope?: "both" | "inline" | "file"; // per-rule scope
}

/**
 * File filter configuration
 */
export interface FileFilterConfig {
	enabled: boolean;
	mode: FilterMode;
	rules: FilterRule[];
}

/**
 * Path Trie Node for efficient path matching
 */
class PathTrieNode {
	children: Map<string, PathTrieNode> = new Map();
	isEndOfPath: boolean = false;
	isFolder: boolean = false;
}

/**
 * Path Trie for efficient folder path matching
 */
class PathTrie {
	private root: PathTrieNode = new PathTrieNode();

	/**
	 * Insert a path into the trie
	 */
	insert(path: string, isFolder: boolean = true): void {
		const parts = this.normalizePath(path)
			.split("/")
			.filter((part) => part.length > 0);
		let current = this.root;

		for (const part of parts) {
			if (!current.children.has(part)) {
				current.children.set(part, new PathTrieNode());
			}
			current = current.children.get(part)!;
		}

		current.isEndOfPath = true;
		current.isFolder = isFolder;
	}

	/**
	 * Check if a path or its parent is in the trie
	 */
	contains(path: string): boolean {
		const parts = this.normalizePath(path)
			.split("/")
			.filter((part) => part.length > 0);
		let current = this.root;

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			// Check if current path segment matches a folder rule
			if (current.children.has(part)) {
				current = current.children.get(part)!;

				// If this is a folder rule and we're checking a path under it
				if (current.isEndOfPath && current.isFolder) {
					return true;
				}
			} else {
				return false;
			}
		}

		// Check if the exact path matches
		return current.isEndOfPath;
	}

	/**
	 * Clear all paths from the trie
	 */
	clear(): void {
		this.root = new PathTrieNode();
	}

	/**
	 * Normalize path for consistent matching
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	}
}

/**
 * File Filter Manager
 *
 * Manages filtering rules and provides efficient file/folder filtering
 */
export class FileFilterManager {
	private config: FileFilterConfig;
	private folderTrie: PathTrie = new PathTrie(); // global (legacy)
	private fileSet: Set<string> = new Set(); // global (legacy)
	private patternRegexes: RegExp[] = []; // global (legacy)
	private cache: Map<string, boolean> = new Map();

	// Scoped indexes for per-rule scope control
	private folderTrieInline: PathTrie = new PathTrie();
	private folderTrieFile: PathTrie = new PathTrie();
	private fileSetInline: Set<string> = new Set();
	private fileSetFile: Set<string> = new Set();
	private patternRegexesInline: RegExp[] = [];
	private patternRegexesFile: RegExp[] = [];

	constructor(config: FileFilterConfig) {
		this.config = config;
		this.rebuildIndexes();
	}

	/**
	 * Update filter configuration
	 */
	updateConfig(config: FileFilterConfig): void {
		this.config = config;
		this.rebuildIndexes();
		this.clearCache();
	}

	/**
	 * Check if a file should be included in indexing
	 */
	shouldIncludeFile(file: TFile, scope: "both" | "inline" | "file" = "both"): boolean {
		if (!this.config.enabled) {
			return true;
		}

		const filePath = file.path;

		// Check cache first
		if (this.cache.has(filePath)) {
			return this.cache.get(filePath)!;
		}

		const result = this.evaluateFile(filePath, scope);
		this.cache.set(filePath, result);
		return result;
	}

	/**
	 * Check if a folder should be included in indexing
	 */
	shouldIncludeFolder(folder: TFolder, scope: "both" | "inline" | "file" = "both"): boolean {
		if (!this.config.enabled) {
			return true;
		}

		const folderPath = folder.path;

		// Check cache first
		if (this.cache.has(folderPath)) {
			return this.cache.get(folderPath)!;
		}

		const result = this.evaluateFolder(folderPath, scope);
		this.cache.set(folderPath, result);
		return result;
	}

	/**
	 * Check if a path should be included (generic method)
	 */
	shouldIncludePath(path: string, scope: "both" | "inline" | "file" = "both"): boolean {
		if (!this.config.enabled) {
			return true;
		}

		// Check cache first
		if (this.cache.has(path)) {
			return this.cache.get(path)!;
		}

		const result = this.evaluatePath(path, scope);
		this.cache.set(path, result);
		return result;
	}

	/**
	 * Get filter statistics
	 */
	getStats(): { cacheSize: number; rulesCount: number; enabled: boolean } {
		return {
			cacheSize: this.cache.size,
			rulesCount: this.config.rules.filter((rule) => rule.enabled).length,
			enabled: this.config.enabled,
		};
	}

	/**
	 * Clear the filter cache
	 */
	clearCache(): void {
		this.cache.clear();
	}

	/**
	 * Evaluate if a file should be included
	 */
	private evaluateFile(filePath: string, scope: "both" | "inline" | "file" = "both"): boolean {
		const matches = this.pathMatches(filePath, scope);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Evaluate if a folder should be included
	 */
	private evaluateFolder(folderPath: string, scope: "both" | "inline" | "file" = "both"): boolean {
		const matches = this.pathMatches(folderPath, scope);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Evaluate if a path should be included (generic)
	 */
	private evaluatePath(path: string, scope: "both" | "inline" | "file" = "both"): boolean {
		const matches = this.pathMatches(path, scope);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Check if a path matches any filter rule
	 */
	private pathMatches(path: string, scope: "both" | "inline" | "file"): boolean {
		const normalizedPath = this.normalizePath(path);

		// Pick the right indexes based on scope
		const fileSet = scope === "file" ? this.fileSetFile : scope === "inline" ? this.fileSetInline : this.fileSet;
		const folderTrie = scope === "file" ? this.folderTrieFile : scope === "inline" ? this.folderTrieInline : this.folderTrie;
		const patternRegexes = scope === "file" ? this.patternRegexesFile : scope === "inline" ? this.patternRegexesInline : this.patternRegexes;

		// Check exact file matches
		if (fileSet.has(normalizedPath)) {
			return true;
		}

		// Check folder matches (including parent folders)
		if (folderTrie.contains(normalizedPath)) {
			return true;
		}

		// Check pattern matches
		for (const regex of patternRegexes) {
			if (regex.test(normalizedPath)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Rebuild internal indexes when configuration changes
	 */
	private rebuildIndexes(): void {
		// Clear legacy and scoped indexes
		this.folderTrie.clear();
		this.fileSet.clear();
		this.patternRegexes = [];
		this.folderTrieInline.clear();
		this.folderTrieFile.clear();
		this.fileSetInline.clear();
		this.fileSetFile.clear();
		this.patternRegexesInline = [];
		this.patternRegexesFile = [];

		for (const rule of this.config.rules) {
			if (!rule.enabled) continue;
			const scope = rule.scope || "both";

			const addTo = (bucket: "both" | "inline" | "file") => {
				switch (rule.type) {
					case "file":
						(bucket === "file"
							? this.fileSetFile
							: bucket === "inline"
							? this.fileSetInline
							: this.fileSet
						).add(this.normalizePath(rule.path));
						break;
					case "folder":
						(bucket === "file"
							? this.folderTrieFile
							: bucket === "inline"
							? this.folderTrieInline
							: this.folderTrie
						).insert(rule.path, true);
						break;
					case "pattern":
						try {
							const regexPattern = this.globToRegex(rule.path);
							(bucket === "file"
								? this.patternRegexesFile
								: bucket === "inline"
								? this.patternRegexesInline
								: this.patternRegexes
							).push(new RegExp(regexPattern, "i"));
						} catch (error) {
							console.warn(`Invalid pattern rule: ${rule.path}`, error);
						}
						break;
				}
			};

			// Add to legacy 'both' indexes if scope is both, else add to specific
			if (scope === "both") {
				addTo("both");
			} else if (scope === "inline") {
				addTo("inline");
			} else if (scope === "file") {
				addTo("file");
			}
		}
	}

	/**
	 * Convert glob pattern to regex
	 */
	private globToRegex(pattern: string): string {
		return pattern
			.replace(/\./g, "\\.")
			.replace(/\*/g, ".*")
			.replace(/\?/g, ".")
			.replace(/\[([^\]]+)\]/g, "[$1]");
	}

	/**
	 * Normalize path for consistent matching
	 */
	private normalizePath(path: string): string {
		return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	}
}
