import "obsidian";
import { Task, TaskCache } from "./task";
import { EditorView, ViewUpdate } from "@codemirror/view";
import { Extension } from "@codemirror/state";
import { App, FoldInfo } from "obsidian";
import {
	Editor,
	EditorRange,
	EditorSuggest,
	MarkdownFileInfo,
	TFile,
} from "obsidian";
import { Component } from "obsidian";
import { HabitProps } from "./habit-card";
import { RootFilterState } from "../components/task-filter/ViewTaskFilter";

interface Token extends EditorRange {
	/** @todo Documentation incomplete. */
	text: string;

	/** @todo Documentation incomplete. */
	type: "tag" | "external-link" | "internal-link";
}

/**
 * @public
 * @unofficial
 */
export interface EditorSuggests {
	/**
	 * Currently active and rendered editor suggestion popup.
	 */
	currentSuggest: null | EditorSuggest<unknown>;

	/**
	 * Registered editor suggestions.
	 *
	 * @remark Used for providing autocompletions for specific strings.
	 * @tutorial Reference official documentation under EditorSuggest<T> for usage.
	 */
	suggests: EditorSuggest<unknown>[];

	/**
	 * Add a new editor suggestion to the list of registered suggestion providers.
	 */
	addSuggest(suggest: EditorSuggest<unknown>): void;

	/**
	 * Close the currently active editor suggestion popup.
	 */
	close(): void;

	/**
	 * Whether there is a editor suggestion popup active and visible.
	 */
	isShowingSuggestion(): boolean;

	/**
	 * Remove a registered editor suggestion from the list of registered suggestion providers.
	 */
	removeSuggest(suggest: EditorSuggest<unknown>): void;

	/**
	 * Update position of currently active and rendered editor suggestion popup.
	 */
	reposition(): void;

	/**
	 * Set the currently active editor suggestion popup to specified suggester.
	 */
	setCurrentSuggest(suggest: EditorSuggest<unknown>): void;

	/**
	 * Run check on focused editor to see whether a suggestion should be triggered and rendered.
	 */
	trigger(editor: MarkdownBaseView, t: TFile, n: boolean): void;
}

interface MarkdownBaseView extends Component {
	/**
	 * Reference to the app.
	 */
	app: App;

	/**
	 * Callback to clear all elements.
	 */
	cleanupLivePreview: null | (() => void);

	/**
	 * Codemirror editor instance.
	 */
	cm: EditorView;

	/**
	 * Whether CodeMirror is initialized.
	 */
	cmInit: boolean;

	/**
	 * Container element of the editor view.
	 */
	containerEl: HTMLElement;

	/**
	 * Popup element for internal link.
	 */
	cursorPopupEl: HTMLElement | null;

	/**
	 * Obsidian editor instance.
	 *
	 * @remark Handles formatting, table creation, highlight adding, etc.
	 */
	editor?: Editor;

	/**
	 * Element in which the CodeMirror editor resides.
	 */
	editorEl: HTMLElement;

	/**
	 * Editor suggester for autocompleting files, links, aliases, etc.
	 */
	editorSuggest: EditorSuggests;

	/**
	 * The CodeMirror plugins that handle the rendering of, and interaction with Obsidian's Markdown.
	 */
	livePreviewPlugin: Extension[];

	/**
	 * Local (always active) extensions for the editor.
	 */
	localExtensions: Extension[];

	/**
	 * Controller of the editor view.
	 */
	owner: MarkdownFileInfo;

	/**
	 * Whether live preview rendering is disabled.
	 */
	sourceMode: boolean;

	/**
	 * Currently active CM instance (table cell CM or main CM).
	 */
	get activeCM(): EditorView;

	/**
	 * Returns attached file of the owner instance.
	 */
	get file(): TFile | null;

	/**
	 * Returns path of the attached file.
	 */
	get path(): string;

	/**
	 * Apply fold history to editor.
	 */
	applyFoldInfo(info: FoldInfo): void;

	/**
	 * Constructs local (always active) extensions for the editor.
	 *
	 * @remark Creates extensions for handling dom events, editor info state fields, update listener, suggestions.
	 */
	buildLocalExtensions(): Extension[];

	/**
	 * Cleanup live preview, remove and then re-add all editor extensions.
	 */
	clear(): void;

	/**
	 * Clean up live preview, remove all extensions, destroy editor.
	 */
	destroy(): void;

	/**
	 * Get the current editor document as a string.
	 */
	get(): string;

	/**
	 * Constructs extensions for the editor based on user settings.
	 *
	 * @remark Creates extension for tab size, RTL rendering, spellchecking, pairing markdown syntax, live preview and vim.
	 */
	getDynamicExtensions(): Extension[];

	/**
	 * Get the current folds of the editor.
	 */
	getFoldInfo(): null | FoldInfo;

	/**
	 * Builds all local extensions and assigns to this.localExtensions.
	 *
	 * @remark Will build extensions if they were not already built.
	 */
	getLocalExtensions(): unknown;

	/**
	 * Creates menu on right mouse click.
	 */
	onContextMenu(event: PointerEvent, x: boolean): Promise<void>;

	/**
	 * Execute click functionality on token on mouse click.
	 */
	onEditorClick(event: MouseEvent, element?: HTMLElement): void;

	/**
	 * Execute drag functionality on drag start.
	 *
	 * @remark Interfaces with dragManager.
	 */
	onEditorDragStart(event: DragEvent): void;

	/**
	 * Execute hover functionality on mouse over event.
	 */
	onEditorLinkMouseover(event: MouseEvent, target: HTMLElement): void;

	/**
	 * Execute context menu functionality on right mouse click.
	 *
	 * @deprecated Use onContextMenu instead.
	 */
	onMenu(event: MouseEvent): void;

	/**
	 * Reposition suggest and scroll position on resize.
	 */
	onResize(): void;

	/**
	 * Execute functionality on CM editor state update.
	 */
	onUpdate(update: ViewUpdate, changed: boolean): void;

	/**
	 * Reinitialize the editor inside new container.
	 */
	reinit(): void;

	/**
	 * Move the editor into the new container.
	 */
	reparent(new_container: HTMLElement): void;

	/**
	 * Bodge to reset the syntax highlighting.
	 *
	 * @remark Uses single-character replacement transaction.
	 */
	resetSyntaxHighlighting(): void;

	/**
	 * Save history of file and data (for caching, for faster reopening of same file in editor).
	 */
	saveHistory(): void;

	/**
	 * Set the state of the editor.
	 */
	set(data: string, clear: boolean): void;

	/**
	 * Enables/disables frontmatter folding.
	 */
	toggleFoldFrontmatter(): void;

	/**
	 * Toggle source mode for editor and dispatch effect.
	 */
	toggleSource(): void;

	/**
	 * Execute functionality of token (open external link, open internal link in leaf, ...).
	 */
	triggerClickableToken(token: Token, new_leaf: boolean): void;

	/**
	 * Callback for onUpdate functionality added as an extension.
	 */
	updateEvent(): (update: ViewUpdate) => void;

	/**
	 * In mobile, creates a popover link on clickable token, if exists.
	 */
	updateLinkPopup(): void;

	/**
	 * Reconfigure/re-add all the dynamic extensions.
	 */
	updateOptions(): void;
}

declare module "obsidian" {
	interface Editor {
		cm: EditorView;
	}

	interface MetadataTypeManager {
		properties: Record<string, any>;
	}

	interface App {
		commands: Commands;
		setting: Setting;
		embedRegistry: EmbedRegistry;

		appId: string;
		metadataTypeManager: MetadataTypeManager;
	}

	interface EmbedRegistry {
		embedByExtension: {
			md: (args: any, file: TFile, subpath: string) => WidgetEditorView;
		};
	}

	interface MetadataCache {
		getTags(): Record<string, string>;
	}

	interface ItemView {
		headerEl: HTMLElement;
		titleEl: HTMLElement;
	}

	interface MenuItem {
		setSubmenu(): Menu;
		titleEl: HTMLElement;
		setWarning(warning: boolean): this;
	}

	interface Setting {
		open(): void;
		openTabById(tabId: string): void;
	}

	interface Commands {
		executeCommandById(commandId: string): void;
		executeCommandById(commandId: string, ...args: any[]): void;
	}

	interface Component {
		_loaded: boolean;
	}

	/**
	 * Plugin interface extension for Bases API support
	 */
	interface Plugin {
		/**
		 * Register a bases view (Obsidian 1.9.3+)
		 * @param viewId - Unique identifier for the view
		 * @param factory - Factory function to create the view
		 * @returns true if registration was successful, false otherwise
		 */
		registerBasesView(
			viewId: string,
			config: BasesViewRegistration
		): boolean;
	}

	interface Workspace {
		on(
			event: "task-genius:task-added",
			callback: (task: Task) => void
		): EventRef;
		on(
			event: "task-genius:task-updated",
			callback: (task: Task) => void
		): EventRef;
		on(
			event: "task-genius:task-deleted",
			callback: (taskId: string) => void
		): EventRef;

		on(
			event: "task-genius:task-cache-updated",
			callback: (cache: TaskCache) => void
		): EventRef;
		on(
			event: "task-genius:task-completed",
			callback: (task: Task) => void
		): EventRef;
		on(
			event: "task-genius:habit-index-updated",
			callback: (habits: HabitProps[]) => void
		): EventRef;
		on(
			event: "task-genius:filter-changed",
			callback: (filterState: RootFilterState, leafId?: string) => void
		): EventRef;

		trigger(event: "task-genius:task-completed", task: Task): void;
		trigger(event: "task-genius:task-added", task: Task): void;
		trigger(event: "task-genius:task-updated", task: Task): void;
		trigger(event: "task-genius:task-deleted", taskId: string): void;
		trigger(
			event: "task-genius:task-cache-updated",
			cache: TaskCache
		): void;
		trigger(
			event: "task-genius:habit-index-updated",
			habits: HabitProps[]
		): void;
		trigger(
			event: "task-genius:filter-changed",
			filterState: RootFilterState,
			leafId?: string
		): void;
	}

	interface WorkspaceLeaf {
		id: string;
		tabHeaderStatusContainerEl: HTMLElement;
		tabHeaderEl: HTMLElement;
		width: number;
		height: number;
		tabHeaderInnerIconEl: HTMLElement;
		tabHeaderInnerTitleEl: HTMLElement;
	}

	interface MarkdownScrollableEditView extends MarkdownBaseView {
		/**
		 * List of CSS classes applied to the editor.
		 */
		cssClasses: [];

		/**
		 * Whether the editor is currently scrolling.
		 */
		isScrolling: boolean;

		/**
		 * Scope for the search component, if exists.
		 */
		scope: Scope | undefined;

		/**
		 * Container for the editor, handles editor size.
		 */
		sizerEl: HTMLElement;

		/**
		 * Set the scroll count of the editor scrollbar.
		 */
		applyScroll(scroll: number): void;

		/**
		 * Constructs local (always active) extensions for the editor.
		 *
		 * @remark Creates extensions for list indentation, tab indentations.
		 */
		buildLocalExtensions(): Extension[];

		/**
		 * Focus the editor (and for mobile: render keyboard).
		 */
		focus(): void;

		/**
		 * Constructs extensions for the editor based on user settings.
		 *
		 * @remark Creates toggleable extensions for showing line numbers, indentation guides,.
		 *          folding, brackets pairing and properties rendering.
		 */
		getDynamicExtensions(): Extension[];

		/**
		 * Get the current scroll count of the editor scrollbar.
		 */
		getScroll(): number;

		/**
		 * Invokes onMarkdownScroll on scroll.
		 */
		handleScroll(): void;

		/**
		 * Hides the editor (sets display: none).
		 */
		hide(): void;

		/**
		 * Clear editor cache and refreshes editor on app css change.
		 */
		onCssChange(): void;

		/**
		 * Update editor size and bottom padding on resize.
		 */
		onResize(): void;

		/**
		 * Update editor suggest position and invokes handleScroll on scroll.
		 */
		onScroll(): void;

		/**
		 * Execute functionality on CM editor state update.
		 */
		onUpdate(update: ViewUpdate, changed: boolean): void;

		/**
		 * Close editor suggest and removes highlights on click.
		 */
		onViewClick(event?: MouseEvent): void;

		/**
		 * Add classes to the editor, functions as a toggle.
		 */
		setCssClass(classes: string[]): void;

		/**
		 * Reveal the editor (sets display: block).
		 */
		show(): void;

		/**
		 * Reveal the search (and replace) component.
		 */
		showSearch(replace: boolean): void;

		/**
		 * Update the bottom padding of the CodeMirror contentdom.
		 */
		updateBottomPadding(height: number): void;
	}

	export interface Fold {
		/** @todo Documentation incomplete. */
		from: number;

		/** @todo Documentation incomplete. */
		to: number;
	}

	interface FoldInfo {
		/** @todo Documentation incomplete. */
		folds: Fold[];

		/** @todo Documentation incomplete. */
		lines: number;
	}

	interface WidgetEditorView {
		editable: boolean;
		showEditor(): void;
		editMode: MarkdownScrollableEditView;
		unload(): void;
		/**
		 * Data after reference.
		 */
		after: string;

		/**
		 * Data before reference.
		 */
		before: string;

		/**
		 * Full file contents.
		 */
		data: string;

		/**
		 * File being currently renamed.
		 */
		fileBeingRenamed: null | TFile;

		/**
		 * Current heading.
		 */
		heading: string;

		/**
		 * Indent.
		 */
		indent: string;

		/**
		 * Inline title element.
		 */
		inlineTitleEl: HTMLElement;

		/**
		 * Full inline content string.
		 */
		lastSavedData: null | string;

		/**
		 * Whether embedding should be saved twice on save.
		 */
		saveAgain: boolean;

		/**
		 * Whether the widget is currently saving.
		 */
		saving: boolean;

		/**
		 * Subpath reference of the path.
		 */
		subpath: string;

		/**
		 * Whether the subpath was not found in the cache.
		 */
		subpathNotFound: boolean;

		/**
		 * Push/pop current scope.
		 */
		applyScope(scope: Scope): void;

		/**
		 * Get the current folds of the editor.
		 */
		getFoldInfo(): null | FoldInfo;

		/**
		 * Splice incoming data at according to subpath for correct reference, then update heading and render.
		 */
		loadContents(data: string, cache: CachedMetadata): void;

		/**
		 * Load file from cache based on stored path.
		 */
		loadFile(): Promise<void>;

		/**
		 * Load file and check if data is different from last saved data, then loads contents.
		 */
		loadFileInternal(data: string, cache?: CachedMetadata): void;

		/**
		 * Update representation on file finished updating.
		 */
		onFileChanged(file: TFile, data: string, cache: CachedMetadata): void;

		/**
		 * Update representation on file rename.
		 */
		onFileRename(file: TAbstractFile, oldPath: string): void;

		/**
		 * On loading widget, register vault change and rename events.
		 */
		onload(): void;

		/**
		 * Save fold made in the editor to foldManager.
		 */
		onMarkdownFold(): void;

		/**
		 * On change of editor title element.
		 */
		onTitleChange(element: HTMLElement): void;

		/**
		 * On keypress on editor title element.
		 */
		onTitleKeydown(event: KeyboardEvent): void;

		/**
		 * On pasting on editor title element.
		 */
		onTitlePaste(element: HTMLElement, event: ClipboardEvent): void;

		/**
		 * On unloading widget, unload component and remove scope.
		 */
		onunload(): void;

		/**
		 * Save changes made in editable widget.
		 */
		save(data: string, delayed?: boolean): Promise<void>;

		/**
		 * On blur widget, save title.
		 */
		saveTitle(element: HTMLElement): void;

		/**
		 * Show preview of widget.
		 */
		showPreview(show?: boolean): void;
	}

	interface AbstractInputSuggest<T> {
		suggestEl: HTMLElement;
	}

	interface Vault {
		getConfig(key: string): string | number | boolean | null;
	}
}
