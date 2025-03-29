import { App, Scope, TFile, WorkspaceLeaf } from "obsidian";
import { MarkdownScrollableEditView, WidgetEditorView } from "obsidian-typings";

import { EditorSelection, Prec } from "@codemirror/state";
import { EditorView, keymap, placeholder, ViewUpdate } from "@codemirror/view";

import { around } from "monkey-around";

/**
 * Creates an embeddable markdown editor
 * @param app The Obsidian app instance
 * @param container The container element
 * @param options Editor options
 * @returns A configured markdown editor
 */
export function createEmbeddableMarkdownEditor(
	app: App,
	container: HTMLElement,
	options: Partial<MarkdownEditorProps>
): EmbeddableMarkdownEditor {
	// Get the editor class
	const EditorClass = resolveEditorPrototype(app);

	// Create the editor instance
	return new EmbeddableMarkdownEditor(app, EditorClass, container, options);
}

/**
 * Resolves the markdown editor prototype from the app
 */
function resolveEditorPrototype(app: App): any {
	// Create a temporary editor to resolve the prototype of ScrollableMarkdownEditor
	const widgetEditorView = app.embedRegistry.embedByExtension.md(
		{ app, containerEl: document.createElement("div") },
		null as unknown as TFile,
		""
	) as WidgetEditorView;

	// Mark as editable to instantiate the editor
	widgetEditorView.editable = true;
	widgetEditorView.showEditor();
	const MarkdownEditor = Object.getPrototypeOf(
		Object.getPrototypeOf(widgetEditorView.editMode!)
	);

	// Unload to remove the temporary editor
	widgetEditorView.unload();

	// Return the constructor, using 'any' type to bypass the abstract class check
	return MarkdownEditor.constructor;
}

interface MarkdownEditorProps {
	cursorLocation?: { anchor: number; head: number };
	value?: string;
	cls?: string;
	placeholder?: string;

	onEnter: (
		editor: EmbeddableMarkdownEditor,
		mod: boolean,
		shift: boolean
	) => boolean;
	onEscape: (editor: EmbeddableMarkdownEditor) => void;
	onSubmit: (editor: EmbeddableMarkdownEditor) => void;
	onBlur: (editor: EmbeddableMarkdownEditor) => void;
	onPaste: (e: ClipboardEvent, editor: EmbeddableMarkdownEditor) => void;
	onChange: (update: ViewUpdate) => void;
}

const defaultProperties: MarkdownEditorProps = {
	cursorLocation: { anchor: 0, head: 0 },
	value: "",
	cls: "",
	placeholder: "",

	onEnter: () => false,
	onEscape: () => {},
	onSubmit: () => {},
	// NOTE: Blur takes precedence over Escape (this can be changed)
	onBlur: () => {},
	onPaste: () => {},
	onChange: () => {},
};

/**
 * A markdown editor that can be embedded in any container
 */
export class EmbeddableMarkdownEditor {
	options: MarkdownEditorProps;
	initial_value: string;
	scope: Scope;
	editor: MarkdownScrollableEditView;

	// Expose commonly accessed properties
	get editorEl(): HTMLElement {
		return this.editor.editorEl;
	}
	get containerEl(): HTMLElement {
		return this.editor.containerEl;
	}
	get activeCM(): EditorView {
		return this.editor.activeCM;
	}
	get app(): App {
		return this.editor.app;
	}
	get owner(): any {
		return this.editor.owner;
	}
	get _loaded(): boolean {
		return this.editor._loaded;
	}

	/**
	 * Construct the editor
	 * @param app - Reference to App instance
	 * @param EditorClass - The editor class constructor
	 * @param container - Container element to add the editor to
	 * @param options - Options for controlling the initial state of the editor
	 */
	constructor(
		app: App,
		EditorClass: any,
		container: HTMLElement,
		options: Partial<MarkdownEditorProps>
	) {
		// Create the editor with the app instance
		this.editor = new EditorClass(app, container, {
			app,
			// This mocks the MarkdownView functions, required for proper scrolling
			onMarkdownScroll: () => {},
			getMode: () => "source",
		});

		// Store user options
		this.options = { ...defaultProperties, ...options };
		this.initial_value = this.options.value!;
		this.scope = new Scope(app.scope);

		// Prevent Mod+Enter default behavior
		this.scope.register(["Mod"], "Enter", () => true);

		// Set up the editor relationship for commands to work
		if (this.owner) {
			this.owner.editMode = this;
			this.owner.editor = this.editor.editor;
		}

		// Set initial content
		this.set(options.value || "", false);

		// Prevent active leaf changes while focused
		this.register(
			around(app.workspace, {
				setActiveLeaf:
					(oldMethod: any) =>
					(leaf: WorkspaceLeaf, ...args: any[]) => {
						if (!this.activeCM?.hasFocus) {
							oldMethod.call(app.workspace, leaf, ...args);
						}
					},
			})
		);

		// Set up blur event handler
		if (
			this.options.onBlur !== defaultProperties.onBlur &&
			this.editor.editor?.cm?.contentDOM
		) {
			this.editor.editor.cm.contentDOM.addEventListener("blur", () => {
				app.keymap.popScope(this.scope);
				if (this._loaded) this.options.onBlur(this);
			});
		}

		// Set up focus event handler
		if (this.editor.editor?.cm?.contentDOM) {
			this.editor.editor.cm.contentDOM.addEventListener("focusin", () => {
				app.keymap.pushScope(this.scope);
				app.workspace.activeEditor = this.owner;
			});
		}

		// Apply custom class if provided
		if (options.cls && this.editorEl) {
			this.editorEl.classList.add(options.cls);
		}

		// Set cursor position if specified
		if (options.cursorLocation && this.editor.editor?.cm) {
			this.editor.editor.cm.dispatch({
				selection: EditorSelection.range(
					options.cursorLocation.anchor,
					options.cursorLocation.head
				),
			});
		}

		// Override the buildLocalExtensions method to add our custom extensions
		const originalBuildLocalExtensions =
			this.editor.buildLocalExtensions.bind(this.editor);
		this.editor.buildLocalExtensions = () => {
			const extensions = originalBuildLocalExtensions();

			// Add placeholder if configured
			if (this.options.placeholder) {
				extensions.push(placeholder(this.options.placeholder));
			}

			// Add paste event handler
			extensions.push(
				EditorView.domEventHandlers({
					paste: (event) => {
						this.options.onPaste(event, this);
					},
				})
			);

			// Add keyboard handlers
			extensions.push(
				Prec.highest(
					keymap.of([
						{
							key: "Enter",
							run: () => this.options.onEnter(this, false, false),
							shift: () =>
								this.options.onEnter(this, false, true),
						},
						{
							key: "Mod-Enter",
							run: () => this.options.onEnter(this, true, false),
							shift: () => this.options.onEnter(this, true, true),
						},
						{
							key: "Escape",
							run: () => {
								this.options.onEscape(this);
								return true;
							},
							preventDefault: true,
						},
					])
				)
			);

			return extensions;
		};

		// Override onUpdate to call our onChange handler
		const originalOnUpdate = this.editor.onUpdate.bind(this.editor);
		this.editor.onUpdate = (update: ViewUpdate, changed: boolean) => {
			originalOnUpdate(update, changed);
			if (changed) this.options.onChange(update);
		};
	}

	// Get the current editor value
	get value(): string {
		return this.editor.editor?.cm?.state.doc.toString() || "";
	}

	// Set content in the editor
	set(content: string, focus: boolean = false): void {
		this.editor.set(content, focus);
	}

	// Register cleanup callback
	register(cb: any): void {
		this.editor.register(cb);
	}

	// Clean up method that ensures proper destruction
	destroy(): void {
		if (this._loaded && typeof this.editor.unload === "function") {
			this.editor.unload();
		}

		this.app.keymap.popScope(this.scope);
		this.app.workspace.activeEditor = null;
		this.containerEl.empty();

		this.editor.destroy();
	}

	// Unload handler
	onunload(): void {
		if (typeof this.editor.onunload === "function") {
			this.editor.onunload();
		}
		this.destroy();
	}

	// Required method for MarkdownScrollableEditView compatibility
	unload(): void {
		if (typeof this.editor.unload === "function") {
			this.editor.unload();
		}
	}
}
