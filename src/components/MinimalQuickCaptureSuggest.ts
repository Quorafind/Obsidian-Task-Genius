import {
	App,
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
	setIcon,
} from "obsidian";
import { Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";
import { getSuggestOptionsByTrigger } from "./suggest/SpecialCharacterSuggests";

interface SuggestOption {
	id: string;
	label: string;
	icon: string;
	description: string;
	replacement: string;
	trigger?: string;
	action?: (editor: Editor, cursor: EditorPosition) => void;
}

export class MinimalQuickCaptureSuggest extends EditorSuggest<SuggestOption> {
	plugin: TaskProgressBarPlugin;
	private isMinimalMode: boolean = false;

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super(app);
		this.plugin = plugin;
	}

	/**
	 * Set the minimal mode context
	 * This should be called by MinimalQuickCaptureModal to activate this suggest
	 */
	setMinimalMode(isMinimal: boolean): void {
		this.isMinimalMode = isMinimal;
	}

	/**
	 * Get the trigger regex for the suggestion
	 */
	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile
	): EditorSuggestTriggerInfo | null {
		// Only trigger in minimal mode
		if (!this.isMinimalMode) {
			return null;
		}

		// Check if we're in a minimal quick capture context
		const editorEl = (editor as any).cm?.dom as HTMLElement;
		if (!editorEl || !editorEl.closest(".quick-capture-modal.minimal")) {
			return null;
		}

		// Get the current line
		const line = editor.getLine(cursor.line);
		const triggerChar =
			this.plugin.settings.quickCapture.minimalModeSettings
				?.suggestTrigger || "/";

		// Define all possible trigger characters
		// Always include "/" for the main menu, plus the configured trigger and special chars
		const allTriggers = ["/", triggerChar, "~", "!", "*", "#"];
		
		// Check if the cursor is right after any trigger character
		if (cursor.ch > 0) {
			const charBeforeCursor = line.charAt(cursor.ch - 1);
			if (allTriggers.includes(charBeforeCursor)) {
				return {
					start: { line: cursor.line, ch: cursor.ch - 1 },
					end: cursor,
					query: charBeforeCursor,
				};
			}
		}

		return null;
	}

	/**
	 * Get suggestions based on the trigger
	 */
	getSuggestions(context: EditorSuggestContext): SuggestOption[] {
		const triggerChar = context.query;

		// If trigger is "/", show all special character options
		if (triggerChar === "/") {
			return [
				{
					id: "date",
					label: t("Date"),
					icon: "calendar",
					description: t("Add date (triggers ~)"),
					replacement: "~",
					trigger: "/",
				},
				{
					id: "priority",
					label: t("Priority"),
					icon: "zap",
					description: t("Set priority (triggers !)"),
					replacement: "!",
					trigger: "/",
				},
				{
					id: "target",
					label: t("Target Location"),
					icon: "folder",
					description: t("Set target location (triggers *)"),
					replacement: "*",
					trigger: "/",
				},
				{
					id: "tag",
					label: t("Tag"),
					icon: "tag",
					description: t("Add tags (triggers #)"),
					replacement: "#",
					trigger: "/",
				},
			];
		}

		// For special characters, get their specific suggestions
		// Map old @ to new * for backward compatibility
		const mappedTrigger = triggerChar === "@" ? "*" : triggerChar;
		return getSuggestOptionsByTrigger(mappedTrigger, this.plugin);
	}

	/**
	 * Render suggestion using Obsidian Menu DOM structure
	 */
	renderSuggestion(suggestion: SuggestOption, el: HTMLElement): void {
		el.addClass("menu-item");
		el.addClass("tappable");

		// Create icon element
		const iconEl = el.createDiv("menu-item-icon");
		setIcon(iconEl, suggestion.icon);

		// Create title element
		const titleEl = el.createDiv("menu-item-title");
		titleEl.textContent = suggestion.label;
	}

	/**
	 * Handle suggestion selection
	 */
	selectSuggestion(
		suggestion: SuggestOption,
		evt: MouseEvent | KeyboardEvent
	): void {
		const editor = this.context?.editor;
		const cursor = this.context?.end;

		if (!editor || !cursor) return;

		// Get the current trigger character
		const currentTrigger = this.context?.query || "";
		
		// Check if this is a specific metadata selection (not the main menu items)
		const isSpecificMetadataSelection = ["!", "~", "#", "*"].includes(currentTrigger) && 
			!["date", "priority", "target", "tag"].includes(suggestion.id);
		
		if (isSpecificMetadataSelection) {
			// This is a specific metadata selection (e.g., "High Priority" from "!" menu)
			// Just remove the trigger character, don't insert anything
			const view = (editor as any).cm as EditorView;
			if (!view) {
				// Fallback to old method if view is not available
				const startPos = { line: cursor.line, ch: cursor.ch - 1 };
				const endPos = cursor;
				editor.replaceRange("", startPos, endPos);
				editor.setCursor(startPos);
			} else {
				// Use CodeMirror 6 changes API to remove the trigger character
				const startOffset = view.state.doc.line(cursor.line + 1).from + cursor.ch - 1;
				const endOffset = view.state.doc.line(cursor.line + 1).from + cursor.ch;
				
				view.dispatch({
					changes: {
						from: startOffset,
						to: endOffset,
						insert: "",
					},
					annotations: [Transaction.userEvent.of("input")],
				});
			}
		} else {
			// This is either:
			// 1. A main menu selection from "/" (replace with special character)
			// 2. A general category selection that should insert the replacement
			const view = (editor as any).cm as EditorView;
			if (!view) {
				// Fallback to old method if view is not available
				const startPos = { line: cursor.line, ch: cursor.ch - 1 };
				const endPos = cursor;
				editor.replaceRange(suggestion.replacement, startPos, endPos);
				const newCursor = {
					line: cursor.line,
					ch: cursor.ch - 1 + suggestion.replacement.length,
				};
				editor.setCursor(newCursor);
			} else if (view.state?.doc) {
				// Use CodeMirror 6 changes API
				const startOffset = view.state.doc.line(cursor.line + 1).from + cursor.ch - 1;
				const endOffset = view.state.doc.line(cursor.line + 1).from + cursor.ch;
				
				view.dispatch({
					changes: {
						from: startOffset,
						to: endOffset,
						insert: suggestion.replacement,
					},
					annotations: [Transaction.userEvent.of("input")],
				});
			} else {
				// Fallback if view.state is not available
				const startPos = { line: cursor.line, ch: cursor.ch - 1 };
				const endPos = cursor;
				editor.replaceRange(suggestion.replacement, startPos, endPos);
				const newCursor = {
					line: cursor.line,
					ch: cursor.ch - 1 + suggestion.replacement.length,
				};
				editor.setCursor(newCursor);
			}
		}

		// Get the modal instance to update button states
		const editorEl = (editor as any).cm?.dom as HTMLElement;
		const modalEl = editorEl?.closest(".quick-capture-modal.minimal");
		const modal = (modalEl as any)?.__minimalQuickCaptureModal;

		// Execute custom action if provided
		if (suggestion.action) {
			const newCursor = {
				line: cursor.line,
				ch: cursor.ch - 1 + suggestion.replacement.length,
			};
			suggestion.action(editor, newCursor);
		}

		// Update modal state if available
		if (modal && typeof modal.parseContentAndUpdateButtons === "function") {
			// Delay to ensure content is updated
			setTimeout(() => {
				modal.parseContentAndUpdateButtons();
			}, 50);
		}

		// Close this suggest to allow the next one to trigger
		this.close();
	}
}
