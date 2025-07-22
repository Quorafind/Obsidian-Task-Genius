import {
	App,
	TFile,
	Notice,
	MarkdownView,
	WorkspaceLeaf,
	Scope,
	AbstractInputSuggest,
	prepareFuzzySearch,
	getFrontMatterInfo,
	editorInfoField,
	moment,
} from "obsidian";
import { StateField, StateEffect, Facet } from "@codemirror/state";
import { EditorView, showPanel, ViewUpdate, Panel } from "@codemirror/view";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "./markdownEditor";
import TaskProgressBarPlugin from "../index";
import { saveCapture, processDateTemplates } from "../utils/fileUtils";
import { t } from "../translations/helper";
import "../styles/quick-capture.css";
import { FileSuggest } from "../components/AutoComplete";

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

// Effect to toggle the quick capture panel
export const toggleQuickCapture = StateEffect.define<boolean>();

// Define a state field to track whether the panel is open
export const quickCaptureState = StateField.define<boolean>({
	create: () => false,
	update(value, tr) {
		for (let e of tr.effects) {
			if (e.is(toggleQuickCapture)) {
				if (tr.state.field(editorInfoField)?.file) {
					value = e.value;
				}
			}
		}
		return value;
	},
	provide: (field) =>
		showPanel.from(field, (active) =>
			active ? createQuickCapturePanel : null
		),
});

// Configuration options for the quick capture panel
export interface QuickCaptureOptions {
	targetFile?: string;
	placeholder?: string;
	appendToFile?: "append" | "prepend" | "replace";
	// New options for enhanced quick capture
	targetType?: "fixed" | "daily-note";
	targetHeading?: string;
	dailyNoteSettings?: {
		format: string;
		folder: string;
		template: string;
	};
}

const handleCancel = (view: EditorView, app: App) => {
	view.dispatch({
		effects: toggleQuickCapture.of(false),
	});

	// Focus back to the original active editor
	setTimeout(() => {
		const activeLeaf = app.workspace.activeLeaf as WorkspaceLeaf;
		if (
			activeLeaf &&
			activeLeaf.view instanceof MarkdownView &&
			activeLeaf.view.editor &&
			!activeLeaf.view.editor.hasFocus()
		) {
			activeLeaf.view.editor.focus();
		}
	}, 10);
};

const handleSubmit = async (
	view: EditorView,
	app: App,
	markdownEditor: EmbeddableMarkdownEditor | null,
	options: QuickCaptureOptions,
	selectedTargetPath: string
) => {
	if (!markdownEditor) return;

	const content = markdownEditor.value.trim();
	if (!content) {
		new Notice(t("Nothing to capture"));
		return;
	}

	try {
		// Use the processed target path or determine based on target type
		const modifiedOptions = {
			...options,
			targetFile: selectedTargetPath,
		};

		await saveCapture(app, content, modifiedOptions);
		// Clear the editor
		markdownEditor.set("", false);

		// Optionally close the panel after successful capture
		view.dispatch({
			effects: toggleQuickCapture.of(false),
		});

		// Show success message with appropriate file path
		let displayPath = selectedTargetPath;
		if (options.targetType === "daily-note" && options.dailyNoteSettings) {
			const dateStr = moment().format(options.dailyNoteSettings.format);
			// For daily notes, the format might include path separators (e.g., YYYY-MM/YYYY-MM-DD)
			// We need to preserve the path structure and only sanitize the final filename
			const pathWithDate = options.dailyNoteSettings.folder
				? `${options.dailyNoteSettings.folder}/${dateStr}.md`
				: `${dateStr}.md`;
			displayPath = sanitizeFilePath(pathWithDate);
		}

		new Notice(`${t("Captured successfully to")} ${displayPath}`);
	} catch (error) {
		new Notice(`${t("Failed to save:")} ${error}`);
	}
};

// Facet to provide configuration options for the quick capture
export const quickCaptureOptions = Facet.define<
	QuickCaptureOptions,
	QuickCaptureOptions
>({
	combine: (values) => {
		return {
			targetFile:
				values.find((v) => v.targetFile)?.targetFile ||
				"Quick capture.md",
			placeholder:
				values.find((v) => v.placeholder)?.placeholder ||
				t("Capture thoughts, tasks, or ideas..."),
			appendToFile:
				values.find((v) => v.appendToFile !== undefined)
					?.appendToFile ?? "append",
			targetType: values.find((v) => v.targetType)?.targetType ?? "fixed",
			targetHeading:
				values.find((v) => v.targetHeading)?.targetHeading ?? "",
			dailyNoteSettings: values.find((v) => v.dailyNoteSettings)
				?.dailyNoteSettings ?? {
				format: "YYYY-MM-DD",
				folder: "",
				template: "",
			},
		};
	},
});

// Create the quick capture panel
function createQuickCapturePanel(view: EditorView): Panel {
	const dom = createDiv({
		cls: "quick-capture-panel",
	});

	const app = view.state.facet(appFacet);
	const options = view.state.facet(quickCaptureOptions);

	// Determine target file path based on target type
	let selectedTargetPath: string;
	if (options.targetType === "daily-note" && options.dailyNoteSettings) {
		const dateStr = moment().format(options.dailyNoteSettings.format);
		// For daily notes, the format might include path separators (e.g., YYYY-MM/YYYY-MM-DD)
		// We need to preserve the path structure and only sanitize the final filename
		const pathWithDate = options.dailyNoteSettings.folder
			? `${options.dailyNoteSettings.folder}/${dateStr}.md`
			: `${dateStr}.md`;
		selectedTargetPath = sanitizeFilePath(pathWithDate);
	} else {
		selectedTargetPath = options.targetFile || "Quick Capture.md";
	}

	// Create header with title and target selection
	const headerContainer = dom.createEl("div", {
		cls: "quick-capture-header-container",
	});

	// "Capture to" label
	headerContainer.createEl("span", {
		cls: "quick-capture-title",
		text: t("Capture to"),
	});

	// Create the target file element (contenteditable)
	const targetFileEl = headerContainer.createEl("div", {
		cls: "quick-capture-target",
		attr: {
			contenteditable: options.targetType === "fixed" ? "true" : "false",
			spellcheck: "false",
		},
		text: selectedTargetPath,
	});

	// Handle manual edits to the target element (only for fixed files)
	if (options.targetType === "fixed") {
		targetFileEl.addEventListener("blur", () => {
			selectedTargetPath = targetFileEl.textContent || selectedTargetPath;
		});
	}

	const editorDiv = dom.createEl("div", {
		cls: "quick-capture-editor",
	});

	let markdownEditor: EmbeddableMarkdownEditor | null = null;

	// Create an instance of the embedded markdown editor
	setTimeout(() => {
		markdownEditor = createEmbeddableMarkdownEditor(app, editorDiv, {
			placeholder: options.placeholder,

			onEnter: (editor, mod, shift) => {
				if (mod) {
					// Submit on Cmd/Ctrl+Enter
					handleSubmit(
						view,
						app,
						markdownEditor,
						options,
						selectedTargetPath
					);
					return true;
				}
				// Allow normal Enter key behavior
				return false;
			},

			onEscape: (editor) => {
				// Close the panel on Escape and focus back to the original active editor
				handleCancel(view, app);
			},

			onSubmit: (editor) => {
				handleSubmit(
					view,
					app,
					markdownEditor,
					options,
					selectedTargetPath
				);
			},
		});

		// Focus the editor when it's created
		markdownEditor?.editor?.focus();

		markdownEditor.scope.register(["Alt"], "c", (e: KeyboardEvent) => {
			e.preventDefault();
			if (!markdownEditor) return false;
			if (markdownEditor.value.trim() === "") {
				handleCancel(view, app);
				return true;
			} else {
				handleSubmit(
					view,
					app,
					markdownEditor,
					options,
					selectedTargetPath
				);
			}
			return true;
		});

		// Only register Alt+X for fixed file type
		if (options.targetType === "fixed") {
			markdownEditor.scope.register(["Alt"], "x", (e: KeyboardEvent) => {
				e.preventDefault();
				targetFileEl.focus();
				return true;
			});
		}
	}, 10); // Small delay to ensure the DOM is ready

	// Button container for actions
	const buttonContainer = dom.createEl("div", {
		cls: "quick-capture-buttons",
	});

	const submitButton = buttonContainer.createEl("button", {
		cls: "quick-capture-submit mod-cta",
		text: t("Capture"),
	});
	submitButton.addEventListener("click", () => {
		handleSubmit(view, app, markdownEditor, options, selectedTargetPath);
	});

	const cancelButton = buttonContainer.createEl("button", {
		cls: "quick-capture-cancel mod-destructive",
		text: t("Cancel"),
	});
	cancelButton.addEventListener("click", () => {
		view.dispatch({
			effects: toggleQuickCapture.of(false),
		});
	});

	// Only add file suggest for fixed file type
	if (options.targetType === "fixed") {
		new FileSuggest(app, targetFileEl, options, (file: TFile) => {
			targetFileEl.textContent = file.path;
			selectedTargetPath = file.path;
			// Focus current editor
			markdownEditor?.editor?.focus();
		});
	}

	return {
		dom,
		top: false,
		// Update method gets called on every editor update
		update: (update: ViewUpdate) => {
			// Implement if needed to update panel content based on editor state
		},
		// Destroy method gets called when the panel is removed
		destroy: () => {
			markdownEditor?.destroy();
			markdownEditor = null;
		},
	};
}

// Facets to make app and plugin instances available to the panel
export const appFacet = Facet.define<App, App>({
	combine: (values) => values[0],
});

export const pluginFacet = Facet.define<
	TaskProgressBarPlugin,
	TaskProgressBarPlugin
>({
	combine: (values) => values[0],
});

// Create the extension to enable quick capture in an editor
export function quickCaptureExtension(app: App, plugin: TaskProgressBarPlugin) {
	return [
		quickCaptureState,
		quickCaptureOptions.of({
			targetFile:
				plugin.settings.quickCapture?.targetFile || "Quick Capture.md",
			placeholder:
				plugin.settings.quickCapture?.placeholder ||
				t("Capture thoughts, tasks, or ideas..."),
			appendToFile:
				plugin.settings.quickCapture?.appendToFile ?? "append",
			targetType: plugin.settings.quickCapture?.targetType ?? "fixed",
			targetHeading: plugin.settings.quickCapture?.targetHeading ?? "",
			dailyNoteSettings: plugin.settings.quickCapture
				?.dailyNoteSettings ?? {
				format: "YYYY-MM-DD",
				folder: "",
				template: "",
			},
		}),
		appFacet.of(app),
		pluginFacet.of(plugin),
	];
}
