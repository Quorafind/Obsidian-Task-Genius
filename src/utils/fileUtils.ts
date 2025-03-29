import { App, getFrontMatterInfo, TFile } from "obsidian";
import { QuickCaptureOptions } from "../editor-ext/quickCapture";

// Save the captured content to the target file
export async function saveCapture(
	app: App,
	content: string,
	options: QuickCaptureOptions
): Promise<void> {
	const { targetFile, appendToFile } = options;

	// Check if target file exists, create if not
	const filePath = targetFile || "Quick Capture.md";
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

		// Create the file
		file = await app.vault.create(
			filePath,
			appendToFile === "prepend"
				? `# Quick Capture\n\n${content}`
				: appendToFile === "replace"
				? content
				: `# Quick Capture\n\n${content}`
		);
	} else if (file instanceof TFile) {
		// Append or replace content in existing file
		app.vault.process(file, (data) => {
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
