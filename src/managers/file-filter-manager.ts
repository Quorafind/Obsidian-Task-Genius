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
	private folderTrie: PathTrie = new PathTrie();
	private fileSet: Set<string> = new Set();
	private patternRegexes: RegExp[] = [];
	private cache: Map<string, boolean> = new Map();

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
	shouldIncludeFile(file: TFile): boolean {
		if (!this.config.enabled) {
			return true;
		}

		const filePath = file.path;

		// Check cache first
		if (this.cache.has(filePath)) {
			return this.cache.get(filePath)!;
		}

		const result = this.evaluateFile(filePath);
		this.cache.set(filePath, result);
		return result;
	}

	/**
	 * Check if a folder should be included in indexing
	 */
	shouldIncludeFolder(folder: TFolder): boolean {
		if (!this.config.enabled) {
			return true;
		}

		const folderPath = folder.path;

		// Check cache first
		if (this.cache.has(folderPath)) {
			return this.cache.get(folderPath)!;
		}

		const result = this.evaluateFolder(folderPath);
		this.cache.set(folderPath, result);
		return result;
	}

	/**
	 * Check if a path should be included (generic method)
	 */
	shouldIncludePath(path: string): boolean {
		if (!this.config.enabled) {
			return true;
		}

		// Check cache first
		if (this.cache.has(path)) {
			return this.cache.get(path)!;
		}

		const result = this.evaluatePath(path);
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
	private evaluateFile(filePath: string): boolean {
		const matches = this.pathMatches(filePath);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Evaluate if a folder should be included
	 */
	private evaluateFolder(folderPath: string): boolean {
		const matches = this.pathMatches(folderPath);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Evaluate if a path should be included (generic)
	 */
	private evaluatePath(path: string): boolean {
		const matches = this.pathMatches(path);

		if (this.config.mode === FilterMode.WHITELIST) {
			return matches;
		} else {
			return !matches;
		}
	}

	/**
	 * Check if a path matches any filter rule
	 */
	private pathMatches(path: string): boolean {
		const normalizedPath = this.normalizePath(path);

		// Check exact file matches
		if (this.fileSet.has(normalizedPath)) {
			return true;
		}

		// Check folder matches (including parent folders)
		if (this.folderTrie.contains(normalizedPath)) {
			return true;
		}

		// Check pattern matches
		for (const regex of this.patternRegexes) {
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
		this.folderTrie.clear();
		this.fileSet.clear();
		this.patternRegexes = [];

		for (const rule of this.config.rules) {
			if (!rule.enabled) continue;

			switch (rule.type) {
				case "file":
					this.fileSet.add(this.normalizePath(rule.path));
					break;
				case "folder":
					this.folderTrie.insert(rule.path, true);
					break;
				case "pattern":
					try {
						// Convert glob pattern to regex
						const regexPattern = this.globToRegex(rule.path);
						this.patternRegexes.push(new RegExp(regexPattern, "i"));
					} catch (error) {
						console.warn(
							`Invalid pattern rule: ${rule.path}`,
							error
						);
					}
					break;
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
