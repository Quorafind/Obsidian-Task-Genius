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
} from "obsidian";
import { StateField, StateEffect, Facet } from "@codemirror/state";
import { EditorView, showPanel, ViewUpdate, Panel } from "@codemirror/view";
import {
	createEmbeddableMarkdownEditor,
	EmbeddableMarkdownEditor,
} from "./markdownEditor";
import TaskProgressBarPlugin from "../index";
import { saveCapture } from "../utils/fileUtils";

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
		new Notice("Nothing to capture");
		return;
	}

	try {
		// Use the selected target path
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

		new Notice(`Captured successfully to ${selectedTargetPath}`);
	} catch (error) {
		new Notice(`Failed to save: ${error}`);
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
				"Capture thoughts, tasks, or ideas...",
			appendToFile:
				values.find((v) => v.appendToFile !== undefined)
					?.appendToFile ?? "append",
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

	// Selected target file path
	let selectedTargetPath = options.targetFile || "Quick Capture.md";

	// Create header with title and target selection
	const headerContainer = dom.createEl("div", {
		cls: "quick-capture-header-container",
	});

	// "Capture to" label
	headerContainer.createEl("span", {
		cls: "quick-capture-title",
		text: "Capture to",
	});

	// Create the target file element (contenteditable)
	const targetFileEl = headerContainer.createEl("div", {
		cls: "quick-capture-target",
		attr: {
			contenteditable: "true",
			spellcheck: "false",
		},
		text: selectedTargetPath,
	});

	// Handle manual edits to the target element
	targetFileEl.addEventListener("blur", () => {
		selectedTargetPath = targetFileEl.textContent || selectedTargetPath;
	});

	// Initialize the file suggestor with callback

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
		markdownEditor.scope.register(["Alt"], "x", (e: KeyboardEvent) => {
			e.preventDefault();
			targetFileEl.focus();
			return true;
		});
	}, 10); // Small delay to ensure the DOM is ready

	// Function to handle submission of the captured text

	// Button container for actions
	const buttonContainer = dom.createEl("div", {
		cls: "quick-capture-buttons",
	});

	const submitButton = buttonContainer.createEl("button", {
		cls: "quick-capture-submit mod-cta",
		text: "Capture",
	});
	submitButton.addEventListener("click", () => {
		handleSubmit(view, app, markdownEditor, options, selectedTargetPath);
	});

	const cancelButton = buttonContainer.createEl("button", {
		cls: "quick-capture-cancel mod-destructive",
		text: "Cancel",
	});
	cancelButton.addEventListener("click", () => {
		view.dispatch({
			effects: toggleQuickCapture.of(false),
		});
	});

	new FileSuggest(app, targetFileEl, options, (file: TFile) => {
		targetFileEl.textContent = file.path;
		selectedTargetPath = file.path;
		// Focus current editor
		markdownEditor?.editor?.focus();
	});

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
				"Capture thoughts, tasks, or ideas...",
			appendToFile:
				plugin.settings.quickCapture?.appendToFile ?? "append",
		}),
		appFacet.of(app),
		pluginFacet.of(plugin),
	];
}
