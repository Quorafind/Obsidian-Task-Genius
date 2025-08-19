/**
 * File type utilities for task parsing
 */

import { TFile } from "obsidian";
import { FileFilterManager } from "../../managers/file-filter-manager";

/**
 * Supported file types for task parsing
 */
export enum SupportedFileType {
	MARKDOWN = "md",
	CANVAS = "canvas",
}

/**
 * Check if a file is supported for task parsing
 */
export function isSupportedFile(file: TFile): boolean {
	return isSupportedFileExtension(file.extension);
}

/**
 * Check if a file is supported for task parsing with filtering
 */
export function isSupportedFileWithFilter(
	file: TFile,
	filterManager?: FileFilterManager
): boolean {
	// First check if the file type is supported
	if (!isSupportedFileExtension(file.extension)) {
		return false;
	}

	// Then check if the file passes the filter
	if (filterManager) {
		return filterManager.shouldIncludeFile(file);
	}

	return true;
}

/**
 * Check if a file extension is supported for task parsing
 */
export function isSupportedFileExtension(extension: string): boolean {
	return Object.values(SupportedFileType).includes(
		extension as SupportedFileType
	);
}

/**
 * Get the file type from a file
 */
export function getFileType(file: TFile): SupportedFileType | null {
	if (file.extension === SupportedFileType.MARKDOWN) {
		return SupportedFileType.MARKDOWN;
	}
	if (file.extension === SupportedFileType.CANVAS) {
		return SupportedFileType.CANVAS;
	}
	return null;
}

/**
 * Check if a file is a markdown file
 */
export function isMarkdownFile(file: TFile): boolean {
	return file.extension === SupportedFileType.MARKDOWN;
}

/**
 * Check if a file is a canvas file
 */
export function isCanvasFile(file: TFile): boolean {
	return file.extension === SupportedFileType.CANVAS;
}

/**
 * Get all supported file extensions
 */
export function getSupportedExtensions(): string[] {
	return Object.values(SupportedFileType);
}

/**
 * Create a file filter function for supported files
 */
export function createSupportedFileFilter() {
	return (file: TFile) => isSupportedFile(file);
}

/**
 * Create a file filter function for supported files with filtering
 */
export function createFilteredFileFilter(filterManager?: FileFilterManager) {
	return (file: TFile) => isSupportedFileWithFilter(file, filterManager);
}

/**
 * Create a combined filter function that checks both file type and custom filters
 */
export function createCombinedFileFilter(filterManager?: FileFilterManager) {
	return (file: TFile) => {
		// First check file type support
		if (!isSupportedFile(file)) {
			return false;
		}

		// Then apply custom filters if provided
		if (filterManager) {
			return filterManager.shouldIncludeFile(file);
		}

		return true;
	};
}
