import { App, getFrontMatterInfo, TFile } from "obsidian";
import { QuickCaptureOptions } from "../../editor-extensions/core/quick-capture-panel";
import { moment } from "obsidian";

/**
 * Get template file with automatic .md extension detection
 * @param app - Obsidian app instance
 * @param templatePath - Template file path (may or may not include .md extension)
 * @returns TFile instance if found, null otherwise
 */
function getTemplateFile(app: App, templatePath: string): TFile | null {
	// First try the original path
	let templateFile = app.vault.getFileByPath(templatePath);

	if (!templateFile && !templatePath.endsWith(".md")) {
		// If not found and doesn't end with .md, try adding .md extension
		const pathWithExtension = `${templatePath}.md`;
		templateFile = app.vault.getFileByPath(pathWithExtension);
	}

	return templateFile;
}

/**
 * Sanitize filename by replacing unsafe characters with safe alternatives
 * This function only sanitizes the filename part, not directory separators
 * @param filename - The filename to sanitize
 * @returns The sanitized filename
 */
function sanitizeFilename(filename: string): string {
	// Replace unsafe characters with safe alternatives, but keep forward slashes for paths
	return filename
		.replace(/[<>:"|*?\\]/g, "-") // Replace unsafe chars with dash
		.replace(/\s+/g, " ") // Normalize whitespace
		.trim(); // Remove leading/trailing whitespace
}

/**
 * Sanitize a file path by sanitizing only the filename part while preserving directory structure
 * @param filePath - The file path to sanitize
 * @returns The sanitized file path
 */
function sanitizeFilePath(filePath: string): string {
	const pathParts = filePath.split("/");
	// Sanitize each part of the path except preserve the directory structure
	const sanitizedParts = pathParts.map((part, index) => {
		// For the last part (filename), we can be more restrictive
		if (index === pathParts.length - 1) {
			return sanitizeFilename(part);
		}
		// For directory names, we still need to avoid problematic characters but can be less restrictive
		return part
			.replace(/[<>:"|*?\\]/g, "-")
			.replace(/\s+/g, " ")
			.trim();
	});
	return sanitizedParts.join("/");
}

/**
 * Process file path with date templates
 * Replaces {{DATE:format}} patterns with current date formatted using moment.js
 * Note: Use file-system safe formats (avoid characters like : < > | " * ? \)
 * @param filePath - The file path that may contain date templates
 * @returns The processed file path with date templates replaced
 */
export function processDateTemplates(filePath: string): string {
	// Match patterns like {{DATE:YYYY-MM-DD}} or {{date:YYYY-MM-DD-HHmm}}
	const dateTemplateRegex = /\{\{DATE?:([^}]+)\}\}/gi;

	const processedPath = filePath.replace(
		dateTemplateRegex,
		(match, format) => {
			try {
				// Check if format is empty or only whitespace
				if (!format || format.trim() === "") {
					return match; // Return original match for empty formats
				}

				// Use moment to format the current date with the specified format
				const formattedDate = moment().format(format);
				// Return the formatted date without sanitizing here to preserve path structure
				return formattedDate;
			} catch (error) {
				console.warn(
					`Invalid date format in template: ${format}`,
					error
				);
				// Return the original match if formatting fails
				return match;
			}
		}
	);

	// Sanitize the entire path while preserving directory structure
	return sanitizeFilePath(processedPath);
}

// Save the captured content to the target file
export async function saveCapture(
	app: App,
	content: string,
	options: QuickCaptureOptions
): Promise<void> {
	const {
		targetFile,
		appendToFile,
		targetType,
		targetHeading,
		dailyNoteSettings,
	} = options;

	let filePath: string;

	// Determine the target file path based on target type
	if (targetType === "daily-note" && dailyNoteSettings) {
		// Generate daily note file path
		const dateStr = moment().format(dailyNoteSettings.format);
		// For daily notes, the format might include path separators (e.g., YYYY-MM/YYYY-MM-DD)
		// We need to preserve the path structure and only sanitize the final filename
		const pathWithDate = dailyNoteSettings.folder
			? `${dailyNoteSettings.folder}/${dateStr}.md`
			: `${dateStr}.md`;
		filePath = sanitizeFilePath(pathWithDate);
	} else {
		// Use fixed file path
		const rawFilePath = targetFile || "Quick Capture.md";
		filePath = processDateTemplates(rawFilePath);
	}

	let file = app.vault.getFileByPath(filePath);

	if (!file) {
		// Create directory structure if needed
		const pathParts = filePath.split("/");
		if (pathParts.length > 1) {
			const dirPath = pathParts.slice(0, -1).join("/");
			try {
				await app.vault.createFolder(dirPath);
			} catch (e) {
				// Directory might already exist, ignore error
			}
		}

		// Create initial content for new file
		let initialContent = "";

		// If it's a daily note and has a template, use the template
		if (targetType === "daily-note" && dailyNoteSettings?.template) {
			const templateFile = getTemplateFile(
				app,
				dailyNoteSettings.template
			);
			if (templateFile instanceof TFile) {
				try {
					initialContent = await app.vault.read(templateFile);
				} catch (e) {
					console.warn("Failed to read template file:", e);
				}
			} else {
				console.warn(
					`Template file not found: ${dailyNoteSettings.template} (tried with and without .md extension)`
				);
			}
		}

		// Add content based on append mode and heading
		if (targetHeading) {
			// If heading is specified, add content under that heading
			if (initialContent) {
				// Check if heading already exists in template
				const headingRegex = new RegExp(
					`^#{1,6}\\s+${targetHeading.replace(
						/[.*+?^${}()|[\]\\]/g,
						"\\$&"
					)}\\s*$`,
					"m"
				);
				if (headingRegex.test(initialContent)) {
					// Heading exists, add content after it
					initialContent = initialContent.replace(
						headingRegex,
						`$&\n\n${content}`
					);
				} else {
					// Heading doesn't exist, add it with content
					initialContent += `\n\n## ${targetHeading}\n\n${content}`;
				}
			} else {
				initialContent = `## ${targetHeading}\n\n${content}`;
			}
		} else {
			// No specific heading
			if (appendToFile === "prepend") {
				initialContent = initialContent
					? `${content}\n\n${initialContent}`
					: content;
			} else {
				initialContent = initialContent
					? `${initialContent}\n\n${content}`
					: content;
			}
		}

		// Create the file
		file = await app.vault.create(filePath, initialContent);
	} else if (file instanceof TFile) {
		// Append or replace content in existing file
		await app.vault.process(file, (data) => {
			// If heading is specified, try to add content under that heading
			if (targetHeading) {
				return addContentUnderHeading(
					data,
					content,
					targetHeading,
					appendToFile || "append"
				);
			}

			// Original logic for no heading specified
			switch (appendToFile) {
				case "append": {
					// Get frontmatter information using Obsidian API
					const fmInfo = getFrontMatterInfo(data);

					// Add a newline before the new content if needed
					const separator = data.endsWith("\n") ? "" : "\n";

					if (fmInfo.exists) {
						// If frontmatter exists, use the contentStart position to append after it
						const contentStartPos = fmInfo.contentStart;

						if (contentStartPos !== undefined) {
							const contentBeforeFrontmatter = data.slice(
								0,
								contentStartPos
							);
							const contentAfterFrontmatter =
								data.slice(contentStartPos);

							return (
								contentBeforeFrontmatter +
								contentAfterFrontmatter +
								separator +
								content
							);
						} else {
							// Fallback if we can't get the exact position
							return data + separator + content;
						}
					} else {
						// No frontmatter, just append to the end
						return data + separator + content;
					}
				}
				case "prepend": {
					// Get frontmatter information
					const fmInfo = getFrontMatterInfo(data);
					const separator = "\n";

					if (fmInfo.exists && fmInfo.contentStart !== undefined) {
						// Insert after frontmatter but before content
						return (
							data.slice(0, fmInfo.contentStart) +
							content +
							separator +
							data.slice(fmInfo.contentStart)
						);
					} else {
						// No frontmatter, prepend to beginning
						return content + separator + data;
					}
				}
				case "replace":
				default:
					return content;
			}
		});
	} else {
		throw new Error("Target is not a file");
	}

	return;
}

/**
 * Add content under a specific heading in markdown text
 * @param data - The original markdown content
 * @param content - The content to add
 * @param heading - The heading to add content under
 * @param mode - How to add the content (append/prepend)
 * @returns The modified markdown content
 */
function addContentUnderHeading(
	data: string,
	content: string,
	heading: string,
	mode: "append" | "prepend" | "replace"
): string {
	const lines = data.split("\n");
	const headingRegex = new RegExp(
		`^(#{1,6})\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
		"i"
	);

	let headingIndex = -1;
	let headingLevel = 0;

	// Find the target heading
	for (let i = 0; i < lines.length; i++) {
		const match = lines[i].match(headingRegex);
		if (match) {
			headingIndex = i;
			headingLevel = match[1].length;
			break;
		}
	}

	if (headingIndex === -1) {
		// Heading not found, add it at the end
		const separator = data.endsWith("\n") ? "" : "\n";
		return `${data}${separator}\n## ${heading}\n\n${content}`;
	}

	// Find the end of this section (next heading of same or higher level)
	let sectionEndIndex = lines.length;
	for (let i = headingIndex + 1; i < lines.length; i++) {
		const line = lines[i];
		const headingMatch = line.match(/^(#{1,6})\s+/);
		if (headingMatch && headingMatch[1].length <= headingLevel) {
			sectionEndIndex = i;
			break;
		}
	}

	// Find the insertion point within the section
	let insertIndex: number;
	if (mode === "prepend") {
		// Insert right after the heading (skip empty lines)
		insertIndex = headingIndex + 1;
		while (
			insertIndex < sectionEndIndex &&
			lines[insertIndex].trim() === ""
		) {
			insertIndex++;
		}
	} else {
		// Insert at the end of the section (before next heading)
		insertIndex = sectionEndIndex;
		// Skip trailing empty lines in the section
		while (
			insertIndex > headingIndex + 1 &&
			lines[insertIndex - 1].trim() === ""
		) {
			insertIndex--;
		}
	}

	// Insert the content
	const contentLines = content.split("\n");
	const result = [
		...lines.slice(0, insertIndex),
		"", // Add empty line before content
		...contentLines,
		"", // Add empty line after content
		...lines.slice(insertIndex),
	];

	return result.join("\n");
}
