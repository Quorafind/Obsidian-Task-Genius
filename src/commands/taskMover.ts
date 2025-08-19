import {
	App,
	FuzzySuggestModal,
	TFile,
	Notice,
	Editor,
	FuzzyMatch,
	SuggestModal,
	MetadataCache,
	MarkdownView,
	MarkdownFileInfo,
} from "obsidian";
import TaskProgressBarPlugin from "../index";
import { buildIndentString } from "../utils";
import { t } from "../translations/helper";
import { isSupportedFile } from "../utils/file/file-type-detector";

/**
 * Modal for selecting a target file to move tasks to
 */
export class FileSelectionModal extends FuzzySuggestModal<TFile | string> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	currentFile: TFile;
	taskLine: number;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		currentFile: TFile,
		taskLine: number
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.currentFile = currentFile;
		this.taskLine = taskLine;
		this.setPlaceholder("Select a file or type to create a new one");
	}

	getItems(): (TFile | string)[] {
		// Get all supported files (markdown and canvas)
		const allFiles = this.app.vault.getFiles();
		const supportedFiles = allFiles.filter(file => isSupportedFile(file));

		// Filter out the current file
		const filteredFiles = supportedFiles.filter(
			(file) => file.path !== this.currentFile.path
		);

		// Sort files by path
		filteredFiles.sort((a, b) => a.path.localeCompare(b.path));

		return filteredFiles;
	}

	getItemText(item: TFile | string): string {
		if (typeof item === "string") {
			return `Create new file: ${item}`;
		}
		return item.path;
	}

	renderSuggestion(item: FuzzyMatch<TFile | string>, el: HTMLElement): void {
		const match = item.item;
		if (typeof match === "string") {
			el.createEl("div", { text: `${t("Create new file:")} ${match}` });
		} else {
			el.createEl("div", { text: match.path });
		}
	}

	onChooseItem(item: TFile | string, evt: MouseEvent | KeyboardEvent): void {
		if (typeof item === "string") {
			// Create a new file
			this.createNewFileWithTasks(item);
		} else {
			// Show modal to select insertion point in existing file
			new BlockSelectionModal(
				this.app,
				this.plugin,
				this.editor,
				this.currentFile,
				item,
				this.taskLine
			).open();
		}
	}

	// If the query doesn't match any existing files, add an option to create a new file
	getSuggestions(query: string): FuzzyMatch<TFile | string>[] {
		const suggestions = super.getSuggestions(query);

		if (
			query &&
			!suggestions.some(
				(match) =>
					typeof match.item === "string" && match.item === query
			)
		) {
			// Check if it's a valid file path
			if (this.isValidFileName(query)) {
				// Add option to create a new file with this name
				suggestions.push({
					item: query,
					match: { score: 1, matches: [] },
				} as FuzzyMatch<string>);
			}
		}

		// Limit results to 20 to avoid performance issues
		return suggestions.slice(0, 20);
	}

	private isValidFileName(name: string): boolean {
		// Basic validation for file names
		return name.length > 0 && !name.includes("/") && !name.includes("\\");
	}

	private async createNewFileWithTasks(fileName: string) {
		try {
			// Ensure file name has .md extension
			if (!fileName.endsWith(".md")) {
				fileName += ".md";
			}

			// Get task content
			const taskContent = this.getTaskWithChildren();

			// Reset indentation for new file (remove all indentation from tasks)
			const resetIndentContent = this.resetIndentation(taskContent);

			// Create file in the same folder as current file
			const folder = this.currentFile.parent;
			const filePath = folder ? `${folder.path}/${fileName}` : fileName;

			// Create the file
			const newFile = await this.app.vault.create(
				filePath,
				resetIndentContent
			);

			// Remove the task from the current file
			this.removeTaskFromCurrentFile();

			// Open the new file
			this.app.workspace.getLeaf(true).openFile(newFile);

			new Notice(`${t("Task moved to")} ${fileName}`);
		} catch (error) {
			new Notice(`${t("Failed to create file:")} ${error}`);
			console.error(error);
		}
	}

	private getTaskWithChildren(): string {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		// Get the current task line
		const currentLine = lines[this.taskLine];
		const currentIndent = this.getIndentation(currentLine);

		// Include the current line and all child tasks
		const resultLines = [currentLine];

		// Look for child tasks (with more indentation)
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const line = lines[i];
			const lineIndent = this.getIndentation(line);

			// If indentation is less or equal to current task, we've exited the child tasks
			if (lineIndent <= currentIndent) {
				break;
			}

			resultLines.push(line);
		}

		return resultLines.join("\n");
	}

	private removeTaskFromCurrentFile() {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		const currentIndent = this.getIndentation(lines[this.taskLine]);

		// Find the range of lines to remove
		let endLine = this.taskLine;
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const lineIndent = this.getIndentation(lines[i]);

			if (lineIndent <= currentIndent) {
				break;
			}

			endLine = i;
		}

		// Remove the task lines using replaceRange
		this.editor.replaceRange(
			"",
			{ line: this.taskLine, ch: 0 },
			{ line: endLine + 1, ch: 0 }
		);
	}

	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}

	// Reset indentation for new files
	private resetIndentation(content: string): string {
		const lines = content.split("\n");

		// Find the minimum indentation in all lines
		let minIndent = Number.MAX_SAFE_INTEGER;
		for (const line of lines) {
			if (line.trim().length === 0) continue; // Skip empty lines
			const indent = this.getIndentation(line);
			minIndent = Math.min(minIndent, indent);
		}

		// If no valid minimum found, or it's already 0, return as is
		if (minIndent === Number.MAX_SAFE_INTEGER || minIndent === 0) {
			return content;
		}

		// Remove the minimum indentation from each line
		return lines
			.map((line) => {
				if (line.trim().length === 0) return line; // Keep empty lines unchanged
				return line.substring(minIndent);
			})
			.join("\n");
	}
}

/**
 * Modal for selecting a heading to insert after in the target file
 */
export class BlockSelectionModal extends SuggestModal<{
	id: string;
	text: string;
	level: number;
	line: number;
}> {
	plugin: TaskProgressBarPlugin;
	editor: Editor;
	sourceFile: TFile;
	targetFile: TFile;
	taskLine: number;
	metadataCache: MetadataCache;

	constructor(
		app: App,
		plugin: TaskProgressBarPlugin,
		editor: Editor,
		sourceFile: TFile,
		targetFile: TFile,
		taskLine: number
	) {
		super(app);
		this.plugin = plugin;
		this.editor = editor;
		this.sourceFile = sourceFile;
		this.targetFile = targetFile;
		this.taskLine = taskLine;
		this.metadataCache = app.metadataCache;
		this.setPlaceholder("Select where to insert the task");
	}

	async getSuggestions(
		query: string
	): Promise<{ id: string; text: string; level: number; line: number }[]> {
		// Get file content
		const fileContent = await this.app.vault.read(this.targetFile);
		const lines = fileContent.split("\n");

		// Get file cache to find headings
		const fileCache = this.metadataCache.getFileCache(this.targetFile);

		let blocks: {
			id: string;
			text: string;
			level: number;
			line: number;
		}[] = [];

		// Add options to insert at the beginning or end of the file
		blocks.push({
			id: "beginning",
			text: t("Beginning of file"),
			level: 0,
			line: 0,
		});

		blocks.push({
			id: "end",
			text: t("End of file"),
			level: 0,
			line: lines.length,
		});

		// Add headings
		if (fileCache && fileCache.headings) {
			for (const heading of fileCache.headings) {
				const text = lines[heading.position.start.line];
				blocks.push({
					id: `heading-start-${heading.position.start.line}`,
					text: `${t("After heading")}: ${text}`,
					level: heading.level,
					line: heading.position.start.line,
				});

				// Add option to insert at end of section
				blocks.push({
					id: `heading-end-${heading.position.start.line}`,
					text: `${t("End of section")}: ${text}`,
					level: heading.level,
					line: heading.position.start.line,
				});
			}
		}

		// Filter blocks based on query
		if (query) {
			blocks = blocks.filter((block) =>
				block.text.toLowerCase().includes(query.toLowerCase())
			);
		}

		// Limit results to 20 to avoid performance issues
		return blocks.slice(0, 20);
	}

	renderSuggestion(
		block: { id: string; text: string; level: number; line: number },
		el: HTMLElement
	) {
		const indent = "  ".repeat(block.level);
		el.createEl("div", { text: `${indent}${block.text}` });
	}

	onChooseSuggestion(
		block: { id: string; text: string; level: number; line: number },
		evt: MouseEvent | KeyboardEvent
	) {
		this.moveTaskToTargetFile(block);
	}

	private async moveTaskToTargetFile(block: {
		id: string;
		text: string;
		level: number;
		line: number;
	}) {
		try {
			// Get task content
			const taskContent = this.getTaskWithChildren();

			// Read target file content
			const fileContent = await this.app.vault.read(this.targetFile);
			const lines = fileContent.split("\n");

			let insertPosition: number;
			let indentLevel: number = 0;

			if (block.id === "beginning") {
				insertPosition = 0;
			} else if (block.id === "end") {
				insertPosition = lines.length;
			} else if (block.id.startsWith("heading-start-")) {
				// Insert after the heading
				insertPosition = block.line + 1;
				// Add one level of indentation for content under a heading
				indentLevel = buildIndentString(this.app).length;
			} else if (block.id.startsWith("heading-end-")) {
				// Find the end of this section (next heading of same or lower level)
				insertPosition = this.findSectionEnd(
					lines,
					block.line,
					block.level
				);
				// Add one level of indentation for content under a heading
				indentLevel = buildIndentString(this.app).length;
			} else {
				throw new Error("Invalid block ID");
			}

			// Reset task indentation to 0 and then add target indentation
			const resetIndentContent = this.resetIndentation(taskContent);
			const indentedTaskContent = this.addIndentation(
				resetIndentContent,
				0
			);

			// Insert task at the position
			await this.app.vault.modify(
				this.targetFile,
				[
					...lines.slice(0, insertPosition),
					indentedTaskContent,
					...lines.slice(insertPosition),
				].join("\n")
			);

			// Remove task from source file
			this.removeTaskFromSourceFile();

			new Notice(`${t("Task moved to")} ${this.targetFile.path}`);
		} catch (error) {
			new Notice(`${t("Failed to move task:")} ${error}`);
			console.error(error);
		}
	}

	// Find the end of a section (line number of the next heading with same or lower level)
	private findSectionEnd(
		lines: string[],
		headingLine: number,
		headingLevel: number
	): number {
		for (let i = headingLine + 1; i < lines.length; i++) {
			const line = lines[i];
			// Check if this line is a heading with same or lower level
			const headingMatch = line.match(/^(#+)\s+/);
			if (headingMatch && headingMatch[1].length <= headingLevel) {
				return i;
			}
		}
		// If no matching heading found, return end of file
		return lines.length;
	}

	private getTaskWithChildren(): string {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		// Get the current task line
		const currentLine = lines[this.taskLine];
		const currentIndent = this.getIndentation(currentLine);

		// Include the current line and all child tasks
		const resultLines = [currentLine];

		// Look for child tasks (with more indentation)
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const line = lines[i];
			const lineIndent = this.getIndentation(line);

			// If indentation is less or equal to current task, we've exited the child tasks
			if (lineIndent <= currentIndent) {
				break;
			}

			resultLines.push(line);
		}

		return resultLines.join("\n");
	}

	// Reset all indentation to 0
	private resetIndentation(content: string): string {
		const lines = content.split("\n");

		// Find the minimum indentation in all lines
		let minIndent = Number.MAX_SAFE_INTEGER;
		for (const line of lines) {
			if (line.trim().length === 0) continue; // Skip empty lines
			const indent = this.getIndentation(line);
			minIndent = Math.min(minIndent, indent);
		}

		// If no valid minimum found, or it's already 0, return as is
		if (minIndent === Number.MAX_SAFE_INTEGER || minIndent === 0) {
			return content;
		}

		// Remove the minimum indentation from each line
		return lines
			.map((line) => {
				if (line.trim().length === 0) return line; // Keep empty lines unchanged
				return line.substring(minIndent);
			})
			.join("\n");
	}

	// Add indentation to all lines
	private addIndentation(content: string, indentSize: number): string {
		if (indentSize <= 0) return content;

		const indentStr = buildIndentString(this.app).repeat(
			indentSize / buildIndentString(this.app).length
		);
		return content
			.split("\n")
			.map((line) => (line.length > 0 ? indentStr + line : line))
			.join("\n");
	}

	private removeTaskFromSourceFile() {
		const content = this.editor.getValue();
		const lines = content.split("\n");

		const currentIndent = this.getIndentation(lines[this.taskLine]);

		// Find the range of lines to remove
		let endLine = this.taskLine;
		for (let i = this.taskLine + 1; i < lines.length; i++) {
			const lineIndent = this.getIndentation(lines[i]);

			if (lineIndent <= currentIndent) {
				break;
			}

			endLine = i;
		}

		// Remove the task lines using replaceRange
		this.editor.replaceRange(
			"",
			{ line: this.taskLine, ch: 0 },
			{ line: endLine + 1, ch: 0 }
		);
	}

	private getIndentation(line: string): number {
		const match = line.match(/^(\s*)/);
		return match ? match[1].length : 0;
	}
}

/**
 * Command to move the current task to another file
 */
export function moveTaskCommand(
	checking: boolean,
	editor: Editor,
	ctx: MarkdownView | MarkdownFileInfo,
	plugin: TaskProgressBarPlugin
): boolean {
	// Get the current file
	const currentFile = ctx.file;

	if (checking) {
		// If checking, return true if we're in a supported file and cursor is on a task line
		if (!currentFile || !isSupportedFile(currentFile)) {
			return false;
		}

		// For markdown files, check if cursor is on a task line
		if (currentFile.extension === "md") {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);

			// Check if line is a task with any of the supported list markers (-, 1., *)
			return line.match(/^\s*(-|\d+\.|\*) \[(.)\]/i) !== null;
		}

		// For canvas files, we don't support direct editing yet
		// This command is primarily for markdown files
		return false;
	}

	// Execute the command
	if (!currentFile) {
		new Notice(t("No active file found"));
		return false;
	}

	const cursor = editor.getCursor();
	new FileSelectionModal(
		plugin.app,
		plugin,
		editor,
		currentFile,
		cursor.line
	).open();

	return true;
}
