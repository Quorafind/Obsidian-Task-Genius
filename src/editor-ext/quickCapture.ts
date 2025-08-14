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
	Menu,
	setIcon,
	EditorPosition,
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
import { QuickCaptureSuggest } from "./QuickCaptureSuggest";

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
	// Task prefix settings
	autoAddTaskPrefix?: boolean;
	taskPrefix?: string;
}

// Task metadata for quick capture
interface TaskMetadata {
	dueDate?: Date;
	scheduledDate?: Date;
	priority?: number;
	tags?: string[];
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
	selectedTargetPath: string,
	taskMetadata?: TaskMetadata
) => {
	if (!markdownEditor) return;

	let content = markdownEditor.value.trim();
	if (!content) {
		new Notice(t("Nothing to capture"));
		return;
	}

	// Add metadata to content if present
	if (taskMetadata) {
		const metadata: string[] = [];
		
		// Add date metadata
		if (taskMetadata.dueDate) {
			metadata.push(`📅 ${moment(taskMetadata.dueDate).format("YYYY-MM-DD")}`);
		}
		
		// Add priority metadata
		if (taskMetadata.priority) {
			const priorityIcons = ["⏬", "🔽", "🔼", "⏫", "🔺"];
			metadata.push(priorityIcons[taskMetadata.priority - 1]);
		}
		
		// Add tags
		if (taskMetadata.tags && taskMetadata.tags.length > 0) {
			metadata.push(...taskMetadata.tags.map(tag => `#${tag}`));
		}
		
		// Append metadata to content
		if (metadata.length > 0) {
			content = `${content} ${metadata.join(" ")}`;
		}
	}
	
	// Add task prefix if enabled
	if (options.autoAddTaskPrefix !== false) { // Default to true
		const prefix = options.taskPrefix || "- [ ]";
		// Check if content doesn't already start with a task or list prefix
		const taskPrefixes = ["- [ ]", "- [x]", "- [X]", "- [/]", "- [-]", "- [>]", "- ", "* ", "+ "];
		const hasPrefix = taskPrefixes.some(p => content.trimStart().startsWith(p));
		
		if (!hasPrefix) {
			// Handle multi-line content
			const lines = content.split("\n");
			content = lines.map(line => {
				// Only add prefix to non-empty lines
				if (line.trim()) {
					return `${prefix} ${line.trim()}`;
				}
				return line;
			}).join("\n");
		}
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
			autoAddTaskPrefix: values.find((v) => v.autoAddTaskPrefix !== undefined)
				?.autoAddTaskPrefix ?? true,
			taskPrefix: values.find((v) => v.taskPrefix)?.taskPrefix ?? "- [ ]",
		};
	},
});

// Helper function to show menu at specified coordinates
function showMenuAtCoords(menu: Menu, x: number, y: number): void {
	menu.showAtMouseEvent(
		new MouseEvent("click", {
			clientX: x,
			clientY: y,
		})
	);
}

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
		const dateStr = moment().format(options.dailyNoteSettings.format || "YYYY-MM-DD");
		// Build the daily note path correctly
		let dailyNotePath = dateStr + ".md";
		if (options.dailyNoteSettings.folder && options.dailyNoteSettings.folder.trim() !== "") {
			// Remove trailing slash if present
			const folder = options.dailyNoteSettings.folder.replace(/\/$/, "");
			dailyNotePath = `${folder}/${dateStr}.md`;
		}
		selectedTargetPath = dailyNotePath;
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

	// Create the target file element (always editable)
	const targetFileEl = headerContainer.createEl("div", {
		cls: "quick-capture-target",
		attr: {
			contenteditable: "true",
			spellcheck: "false",
		},
		text: selectedTargetPath,
	});

	// Handle manual edits to the target element
	// Track input events for real-time updates
	targetFileEl.addEventListener("input", () => {
		selectedTargetPath = targetFileEl.textContent || "";
	});
	
	// Also handle blur for when user clicks away
	targetFileEl.addEventListener("blur", () => {
		const newPath = targetFileEl.textContent?.trim();
		if (newPath) {
			selectedTargetPath = newPath;
			// Ensure .md extension if not present
			if (!selectedTargetPath.endsWith(".md")) {
				selectedTargetPath += ".md";
				targetFileEl.textContent = selectedTargetPath;
			}
		} else {
			// If empty, restore to default
			selectedTargetPath = options.targetFile || "Quick Capture.md";
			targetFileEl.textContent = selectedTargetPath;
		}
	});
	
	// Handle Enter key to confirm edit (will set up after editor is created)

	// Quick action buttons container - add directly to header
	const quickActionsContainer = headerContainer.createEl("div", {
		cls: "quick-capture-actions",
	});

	// Task metadata state
	let taskMetadata: TaskMetadata = {};

	// Date button
	const dateButton = quickActionsContainer.createEl("button", {
		cls: ["quick-action-button", "clickable-icon"],
		attr: { "aria-label": t("Set date") },
	});
	setIcon(dateButton, "calendar");

	// Priority button  
	const priorityButton = quickActionsContainer.createEl("button", {
		cls: ["quick-action-button", "clickable-icon"],
		attr: { "aria-label": t("Set priority") },
	});
	setIcon(priorityButton, "zap");

	// Tags button
	const tagsButton = quickActionsContainer.createEl("button", {
		cls: ["quick-action-button", "clickable-icon"],
		attr: { "aria-label": t("Add tags") },
	});
	setIcon(tagsButton, "tag");

	// Helper function to update button state
	const updateButtonState = (button: HTMLButtonElement, isActive: boolean) => {
		if (isActive) {
			button.addClass("active");
		} else {
			button.removeClass("active");
		}
	};

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
						selectedTargetPath,
						taskMetadata
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
		
		// Now set up the Enter key handler for target field
		targetFileEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				targetFileEl.blur();
				// Focus back to editor
				markdownEditor?.editor?.focus();
			}
		});

		// Activate the suggest system for this editor
		const plugin = view.state.facet(pluginFacet);
		if (plugin.quickCaptureSuggest && markdownEditor?.editor) {
			plugin.quickCaptureSuggest.setQuickCaptureContext(
				true,
				taskMetadata,
				updateButtonState,
				{
					dateButton,
					priorityButton,
					tagsButton
				},
				(newPath: string) => {
					// Update the selected target path
					selectedTargetPath = newPath;
					// Update the display
					if (targetFileEl) {
						targetFileEl.textContent = newPath;
					}
				}
			);
		}

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

		// Register keyboard shortcuts for quick actions
		markdownEditor.scope.register(["Alt"], "d", (e: KeyboardEvent) => {
			e.preventDefault();
			dateButton.click();
			return true;
		});

		markdownEditor.scope.register(["Alt"], "p", (e: KeyboardEvent) => {
			e.preventDefault();
			priorityButton.click();
			return true;
		});

		markdownEditor.scope.register(["Alt"], "t", (e: KeyboardEvent) => {
			e.preventDefault();
			tagsButton.click();
			return true;
		});
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

	// Date button click handler
	dateButton.addEventListener("click", () => {
		const quickDates = [
			{ label: t("Today"), date: moment().toDate() },
			{ label: t("Tomorrow"), date: moment().add(1, "day").toDate() },
			{ label: t("Next week"), date: moment().add(1, "week").toDate() },
			{ label: t("Next month"), date: moment().add(1, "month").toDate() },
		];

		const menu = new Menu();

		quickDates.forEach((quickDate) => {
			menu.addItem((item) => {
				item.setTitle(quickDate.label);
				item.setIcon("calendar");
				item.onClick(() => {
					taskMetadata.dueDate = quickDate.date;
					updateButtonState(dateButton, true);
					// Focus back to editor
					markdownEditor?.editor?.focus();
				});
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Clear date"));
			item.setIcon("x");
			item.onClick(() => {
				delete taskMetadata.dueDate;
				updateButtonState(dateButton, false);
				markdownEditor?.editor?.focus();
			});
		});

		const rect = dateButton.getBoundingClientRect();
		showMenuAtCoords(menu, rect.left, rect.bottom + 5);
	});

	// Priority button click handler
	priorityButton.addEventListener("click", () => {
		const priorities = [
			{ level: 5, label: t("Highest"), icon: "🔺" },
			{ level: 4, label: t("High"), icon: "⏫" },
			{ level: 3, label: t("Medium"), icon: "🔼" },
			{ level: 2, label: t("Low"), icon: "🔽" },
			{ level: 1, label: t("Lowest"), icon: "⏬" },
		];

		const menu = new Menu();

		priorities.forEach((priority) => {
			menu.addItem((item) => {
				item.setTitle(`${priority.icon} ${priority.label}`);
				item.onClick(() => {
					taskMetadata.priority = priority.level;
					updateButtonState(priorityButton, true);
					markdownEditor?.editor?.focus();
				});
			});
		});

		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Clear priority"));
			item.setIcon("x");
			item.onClick(() => {
				delete taskMetadata.priority;
				updateButtonState(priorityButton, false);
				markdownEditor?.editor?.focus();
			});
		});

		const rect = priorityButton.getBoundingClientRect();
		showMenuAtCoords(menu, rect.left, rect.bottom + 5);
	});

	// Tags button click handler
	tagsButton.addEventListener("click", () => {
		const menu = new Menu();
		
		// Add common tags as quick options
		const commonTags = ["important", "urgent", "todo", "review", "idea", "question"];
		
		commonTags.forEach((tag) => {
			const isActive = taskMetadata.tags?.includes(tag);
			menu.addItem((item) => {
				item.setTitle(isActive ? `✓ #${tag}` : `#${tag}`);
				item.setIcon("tag");
				item.onClick(() => {
					if (!taskMetadata.tags) {
						taskMetadata.tags = [];
					}
					if (isActive) {
						// Remove tag
						taskMetadata.tags = taskMetadata.tags.filter(t => t !== tag);
						if (taskMetadata.tags.length === 0) {
							delete taskMetadata.tags;
							updateButtonState(tagsButton, false);
						}
					} else {
						// Add tag
						taskMetadata.tags.push(tag);
						updateButtonState(tagsButton, true);
					}
					markdownEditor?.editor?.focus();
				});
			});
		});
		
		menu.addSeparator();
		menu.addItem((item) => {
			item.setTitle(t("Clear all tags"));
			item.setIcon("x");
			item.onClick(() => {
				delete taskMetadata.tags;
				updateButtonState(tagsButton, false);
				markdownEditor?.editor?.focus();
			});
		});
		
		const rect = tagsButton.getBoundingClientRect();
		showMenuAtCoords(menu, rect.left, rect.bottom + 5);
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
			// Deactivate the suggest system
			const plugin = view.state.facet(pluginFacet);
			if (plugin.quickCaptureSuggest) {
				plugin.quickCaptureSuggest.setQuickCaptureContext(false);
			}
			
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
	// Create and register the suggest system
	if (!plugin.quickCaptureSuggest) {
		plugin.quickCaptureSuggest = new QuickCaptureSuggest(app, plugin);
		plugin.registerEditorSuggest(plugin.quickCaptureSuggest);
	}
	
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
			autoAddTaskPrefix:
				plugin.settings.quickCapture?.autoAddTaskPrefix ?? true,
			taskPrefix:
				plugin.settings.quickCapture?.taskPrefix ?? "- [ ]",
		}),
		appFacet.of(app),
		pluginFacet.of(plugin),
	];
}
