import {
	EditorView,
	ViewPlugin,
	ViewUpdate,
	Decoration,
	DecorationSet,
	WidgetType,
	MatchDecorator,
	PluginValue,
	PluginSpec,
} from "@codemirror/view";
import { App, editorLivePreviewField, Keymap, Menu } from "obsidian";
import TaskProgressBarPlugin from "../../index";
import { Annotation } from "@codemirror/state";
// @ts-ignore - This import is necessary but TypeScript can't find it
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { t } from "../../translations/helper";
export const priorityChangeAnnotation = Annotation.define();

// Priority definitions for emoji format (Tasks plugin style)
export const TASK_PRIORITIES = {
	highest: {
		emoji: "🔺",
		text: t("Highest priority"),
		regex: "🔺",
		dataviewValue: "highest",
		numericValue: 5,
	},
	high: {
		emoji: "⏫",
		text: t("High priority"),
		regex: "⏫",
		dataviewValue: "high",
		numericValue: 4,
	},
	medium: {
		emoji: "🔼",
		text: t("Medium priority"),
		regex: "🔼",
		dataviewValue: "medium",
		numericValue: 3,
	},
	none: {
		emoji: "",
		text: t("No priority"),
		regex: "",
		dataviewValue: "none",
		numericValue: 0,
	},
	low: {
		emoji: "🔽",
		text: t("Low priority"),
		regex: "🔽",
		dataviewValue: "low",
		numericValue: 2,
	},
	lowest: {
		emoji: "⏬️",
		text: t("Lowest priority"),
		regex: "⏬️",
		dataviewValue: "lowest",
		numericValue: 1,
	},
};

// Task plugin format priorities (letter format)
export const LETTER_PRIORITIES = {
	A: {
		text: t("Priority A"),
		regex: "\\[#A\\]",
		numericValue: 4,
	},
	B: {
		text: t("Priority B"),
		regex: "\\[#B\\]",
		numericValue: 3,
	},
	C: {
		text: t("Priority C"),
		regex: "\\[#C\\]",
		numericValue: 2,
	},
};

// Combined regular expressions for detecting priorities
const emojiPriorityRegex = Object.values(TASK_PRIORITIES)
	.map((p) => p.regex)
	.filter((r) => r)
	.join("|");

const letterPriorityRegex = Object.values(LETTER_PRIORITIES)
	.map((p) => p.regex)
	.join("|");

// Dataview priorities regex - improved to handle various formats
const dataviewPriorityRegex =
	/\[priority::\s*(highest|high|medium|none|low|lowest|\d+)\]/gi;

// Priority mode detection type
type PriorityMode = "tasks" | "dataview" | "letter" | "none";

// Helper to detect priority mode for a given line
function detectPriorityMode(
	lineText: string,
	useDataviewFormat: boolean
): PriorityMode {
	// Create non-global version for testing to avoid side effects
	const dataviewTestRegex =
		/\[priority::\s*(highest|high|medium|none|low|lowest|\d+)\]/i;

	// If user prefers dataview format, prioritize dataview detection
	if (useDataviewFormat) {
		if (dataviewTestRegex.test(lineText)) {
			return "dataview";
		}
	}

	// Check for emoji priorities (Tasks plugin format)
	if (/(🔺|⏫|🔼|🔽|⏬️)/.test(lineText)) {
		return "tasks";
	}

	// Check for letter priorities
	if (/\[#([ABC])\]/.test(lineText)) {
		return "letter";
	}

	// Check for dataview format if not preferred but present
	if (!useDataviewFormat && dataviewTestRegex.test(lineText)) {
		return "dataview";
	}

	return "none";
}

// Helper to get priority display text based on mode and value
function getPriorityDisplayText(priority: string, mode: PriorityMode): string {
	switch (mode) {
		case "dataview":
			// Extract the priority value from dataview format
			const match = priority.match(/\[priority::\s*(\w+|\d+)\]/i);
			if (match) {
				const value = match[1].toLowerCase();
				const taskPriority = Object.values(TASK_PRIORITIES).find(
					(p) => p.dataviewValue === value
				);
				return taskPriority
					? `${taskPriority.emoji} ${taskPriority.text}`
					: priority;
			}
			return priority;
		case "tasks":
			const taskPriority = Object.values(TASK_PRIORITIES).find(
				(p) => p.emoji === priority
			);
			return taskPriority
				? `${taskPriority.emoji} ${taskPriority.text}`
				: priority;
		case "letter":
			const letter = priority.match(/\[#([ABC])\]/)?.[1];
			const letterPriority = letter
				? LETTER_PRIORITIES[letter as keyof typeof LETTER_PRIORITIES]
				: null;
			return letterPriority ? letterPriority.text : priority;
		default:
			return priority;
	}
}

class PriorityWidget extends WidgetType {
	constructor(
		readonly app: App,
		readonly plugin: TaskProgressBarPlugin,
		readonly view: EditorView,
		readonly from: number,
		readonly to: number,
		readonly currentPriority: string,
		readonly mode: PriorityMode
	) {
		super();
	}

	eq(other: PriorityWidget): boolean {
		return (
			this.from === other.from &&
			this.to === other.to &&
			this.currentPriority === other.currentPriority &&
			this.mode === other.mode
		);
	}

	toDOM(): HTMLElement {
		try {
			const wrapper = createEl("span", {
				cls: "priority-widget",
				attr: {
					"aria-label": t("Task Priority"),
				},
			});

			let prioritySpan: HTMLElement;

			if (this.mode === "letter") {
				// Create spans for letter format priority [#A]
				const leftBracket = document.createElement("span");
				leftBracket.classList.add(
					"cm-formatting",
					"cm-formatting-link",
					"cm-hmd-barelink",
					"cm-link",
					"cm-list-1"
				);
				leftBracket.setAttribute("spellcheck", "false");
				leftBracket.textContent = "[";

				prioritySpan = document.createElement("span");
				prioritySpan.classList.add(
					"cm-hmd-barelink",
					"cm-link",
					"cm-list-1"
				);
				prioritySpan.textContent = this.currentPriority.slice(1, -1); // Remove brackets

				const rightBracket = document.createElement("span");
				rightBracket.classList.add(
					"cm-formatting",
					"cm-formatting-link",
					"cm-hmd-barelink",
					"cm-link",
					"cm-list-1"
				);
				rightBracket.setAttribute("spellcheck", "false");
				rightBracket.textContent = "]";

				wrapper.appendChild(leftBracket);
				wrapper.appendChild(prioritySpan);
				wrapper.appendChild(rightBracket);
			} else if (this.mode === "dataview") {
				prioritySpan = document.createElement("span");
				prioritySpan.classList.add("task-priority-dataview");
				prioritySpan.textContent = this.currentPriority;
				wrapper.appendChild(prioritySpan);
			} else {
				prioritySpan = document.createElement("span");
				prioritySpan.classList.add("task-priority");
				prioritySpan.textContent = this.currentPriority;
				wrapper.appendChild(prioritySpan);
			}

			// Attach click event to the inner span
			prioritySpan.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				this.showPriorityMenu(e);
			});

			return wrapper;
		} catch (error) {
			console.error("Error creating priority widget DOM:", error);
			// Return a fallback element to prevent crashes
			const fallback = createEl("span", {
				cls: "priority-widget-error",
				text: this.currentPriority,
			});
			return fallback;
		}
	}

	private showPriorityMenu(e: MouseEvent) {
		try {
			const menu = new Menu();
			const useDataviewFormat =
				this.plugin.settings.preferMetadataFormat === "dataview";

			if (this.mode === "letter") {
				// Only show letter priorities
				Object.entries(LETTER_PRIORITIES).forEach(([key, priority]) => {
					menu.addItem((item) => {
						item.setTitle(priority.text);
						item.onClick(() => {
							this.setPriority(`[#${key}]`, "letter");
						});
					});
				});
				menu.addItem((item) => {
					item.setTitle(t("Remove Priority"));
					item.onClick(() => {
						this.removePriority("letter");
					});
				});
			} else {
				// Show the 6 priority levels based on user preference, excluding 'none'
				Object.entries(TASK_PRIORITIES).forEach(([key, priority]) => {
					if (key !== "none") {
						menu.addItem((item) => {
							const displayText = useDataviewFormat
								? priority.text
								: `${priority.emoji} ${priority.text}`;
							item.setTitle(displayText);
							item.onClick(() => {
								if (useDataviewFormat) {
									this.setPriority(
										`[priority:: ${priority.dataviewValue}]`,
										"dataview"
									);
								} else {
									this.setPriority(priority.emoji, "tasks");
								}
							});
						});
					}
				});

				// Add "Remove Priority" option at the bottom
				menu.addItem((item) => {
					item.setTitle(t("Remove Priority"));
					item.onClick(() => {
						this.removePriority(
							useDataviewFormat ? "dataview" : "tasks"
						);
					});
				});
			}

			menu.showAtMouseEvent(e);
		} catch (error) {
			console.error("Error showing priority menu:", error);
		}
	}

	private setPriority(priority: string, mode: PriorityMode) {
		try {
			// Validate view state before making changes
			if (!this.view || this.view.state.doc.length < this.to) {
				console.warn("Invalid view state, skipping priority update");
				return;
			}

			const line = this.view.state.doc.lineAt(this.from);
			let newLine = line.text;

			// Remove existing priority first
			newLine = this.removeExistingPriority(newLine);

			// Add new priority at the end
			newLine = newLine.trimEnd() + " " + priority;

			const transaction = this.view.state.update({
				changes: { from: line.from, to: line.to, insert: newLine },
				annotations: [priorityChangeAnnotation.of(true)],
			});
			this.view.dispatch(transaction);
		} catch (error) {
			console.error("Error setting priority:", error);
		}
	}

	private removePriority(mode: PriorityMode) {
		try {
			// Validate view state before making changes
			if (!this.view || this.view.state.doc.length < this.to) {
				console.warn("Invalid view state, skipping priority removal");
				return;
			}

			const line = this.view.state.doc.lineAt(this.from);
			const newLine = this.removeExistingPriority(line.text).trimEnd();

			const transaction = this.view.state.update({
				changes: { from: line.from, to: line.to, insert: newLine },
				annotations: [priorityChangeAnnotation.of(true)],
			});
			this.view.dispatch(transaction);
		} catch (error) {
			console.error("Error removing priority:", error);
		}
	}

	private removeExistingPriority(lineText: string): string {
		let newLine = lineText;

		// Remove dataview priority
		newLine = newLine.replace(/\[priority::\s*\w+\]/i, "");

		// Remove emoji priorities
		newLine = newLine.replace(/(🔺|⏫|🔼|🔽|⏬️)/g, "");

		// Remove letter priorities
		newLine = newLine.replace(/\[#([ABC])\]/g, "");

		// Clean up extra spaces
		newLine = newLine.replace(/\s+/g, " ");

		return newLine;
	}
}

export function priorityPickerExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	// Don't enable if the setting is off
	if (!plugin.settings.enablePriorityPicker) {
		return [];
	}

	class PriorityViewPluginValue implements PluginValue {
		public readonly view: EditorView;
		public readonly plugin: TaskProgressBarPlugin;
		decorations: DecorationSet = Decoration.none;
		private lastUpdate: number = 0;
		private readonly updateThreshold: number = 50;
		public isDestroyed: boolean = false;

		// Emoji priorities matcher
		private readonly emojiMatch = new MatchDecorator({
			regexp: new RegExp(`(${emojiPriorityRegex})`, "g"),
			decorate: (
				add,
				from: number,
				to: number,
				match: RegExpExecArray,
				view: EditorView
			) => {
				try {
					if (!this.shouldRender(view, from, to)) {
						return;
					}

					const useDataviewFormat =
						this.plugin.settings.preferMetadataFormat ===
						"dataview";
					const line = this.view.state.doc.lineAt(from);
					const mode = detectPriorityMode(
						line.text,
						useDataviewFormat
					);

					add(
						from,
						to,
						Decoration.replace({
							widget: new PriorityWidget(
								app,
								plugin,
								view,
								from,
								to,
								match[0],
								mode
							),
						})
					);
				} catch (error) {
					console.warn("Error decorating emoji priority:", error);
				}
			},
		});

		// Letter priorities matcher
		private readonly letterMatch = new MatchDecorator({
			regexp: new RegExp(`(${letterPriorityRegex})`, "g"),
			decorate: (
				add,
				from: number,
				to: number,
				match: RegExpExecArray,
				view: EditorView
			) => {
				try {
					if (!this.shouldRender(view, from, to)) {
						return;
					}

					add(
						from,
						to,
						Decoration.replace({
							widget: new PriorityWidget(
								app,
								plugin,
								view,
								from,
								to,
								match[0],
								"letter"
							),
						})
					);
				} catch (error) {
					console.warn("Error decorating letter priority:", error);
				}
			},
		});

		// Dataview priorities matcher
		private readonly dataviewMatch = new MatchDecorator({
			regexp: dataviewPriorityRegex,
			decorate: (
				add,
				from: number,
				to: number,
				match: RegExpExecArray,
				view: EditorView
			) => {
				try {
					if (!this.shouldRender(view, from, to)) {
						return;
					}
					add(
						from,
						to,
						Decoration.replace({
							widget: new PriorityWidget(
								app,
								plugin,
								view,
								from,
								to,
								match[0],
								"dataview"
							),
						})
					);
				} catch (error) {
					console.warn("Error decorating dataview priority:", error);
				}
			},
		});

		constructor(view: EditorView) {
			this.view = view;
			this.plugin = plugin;
			this.updateDecorations(view);
		}

		update(update: ViewUpdate): void {
			if (this.isDestroyed) return;

			try {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet ||
					update.transactions.some((tr) =>
						tr.annotation(priorityChangeAnnotation)
					)
				) {
					// Throttle updates to avoid performance issues with large documents
					const now = Date.now();
					if (now - this.lastUpdate > this.updateThreshold) {
						this.lastUpdate = now;
						this.updateDecorations(update.view, update);
					} else {
						// Schedule an update in the near future to ensure rendering
						setTimeout(() => {
							if (this.view && !this.isDestroyed) {
								this.updateDecorations(this.view);
							}
						}, this.updateThreshold);
					}
				}
			} catch (error) {
				console.error("Error in priority picker update:", error);
			}
		}

		destroy(): void {
			this.isDestroyed = true;
			this.decorations = Decoration.none;
		}

		updateDecorations(view: EditorView, update?: ViewUpdate) {
			if (this.isDestroyed) return;

			// Only apply in live preview mode
			if (!this.isLivePreview(view.state)) {
				this.decorations = Decoration.none;
				return;
			}

			try {
				const useDataviewFormat =
					this.plugin.settings.preferMetadataFormat === "dataview";

				// Use incremental update when possible for better performance
				if (update && !update.docChanged && this.decorations.size > 0) {
					// Update decorations based on user preference
					if (useDataviewFormat) {
						// Prioritize dataview decorations
						const dataviewDecos = this.dataviewMatch.updateDeco(
							update,
							this.decorations
						);
						if (dataviewDecos.size > 0) {
							this.decorations = dataviewDecos;
							return;
						}
					}

					// Try emoji decorations
					const emojiDecos = this.emojiMatch.updateDeco(
						update,
						this.decorations
					);
					if (emojiDecos.size > 0) {
						this.decorations = emojiDecos;
						return;
					}

					// Try letter decorations
					const letterDecos = this.letterMatch.updateDeco(
						update,
						this.decorations
					);
					if (letterDecos.size > 0) {
						this.decorations = letterDecos;
						return;
					}

					// Try dataview decorations if not preferred
					if (!useDataviewFormat) {
						const dataviewDecos = this.dataviewMatch.updateDeco(
							update,
							this.decorations
						);
						this.decorations = dataviewDecos;
					}
				} else {
					// Create new decorations from scratch
					let decorations = Decoration.none;

					if (useDataviewFormat) {
						// Prioritize dataview format
						decorations = this.dataviewMatch.createDeco(view);
						if (decorations.size === 0) {
							// Fallback to emoji format
							decorations = this.emojiMatch.createDeco(view);
						}
					} else {
						// Prioritize emoji format
						decorations = this.emojiMatch.createDeco(view);
						if (decorations.size === 0) {
							// Fallback to dataview format
							decorations = this.dataviewMatch.createDeco(view);
						}
					}

					// Always check for letter format as it's independent
					const letterDecos = this.letterMatch.createDeco(view);
					if (letterDecos.size > 0) {
						// Merge letter decorations with existing decorations
						const ranges: {
							from: number;
							to: number;
							value: Decoration;
						}[] = [];
						const iter = letterDecos.iter();
						while (iter.value !== null) {
							ranges.push({
								from: iter.from,
								to: iter.to,
								value: iter.value,
							});
							iter.next();
						}

						if (ranges.length > 0) {
							decorations = decorations.update({
								add: ranges,
							});
						}
					}

					this.decorations = decorations;
				}
			} catch (e) {
				console.warn(
					"Error updating priority decorations, clearing decorations",
					e
				);
				// Clear decorations on error to prevent crashes
				this.decorations = Decoration.none;
			}
		}

		isLivePreview(state: EditorView["state"]): boolean {
			try {
				return state.field(editorLivePreviewField);
			} catch (error) {
				console.warn("Error checking live preview state:", error);
				return false;
			}
		}

		shouldRender(
			view: EditorView,
			decorationFrom: number,
			decorationTo: number
		) {
			try {
				// Validate positions
				if (
					decorationFrom < 0 ||
					decorationTo > view.state.doc.length ||
					decorationFrom >= decorationTo
				) {
					return false;
				}

				const syntaxNode = syntaxTree(view.state).resolveInner(
					decorationFrom + 1
				);
				const nodeProps = syntaxNode.type.prop(tokenClassNodeProp);

				if (nodeProps) {
					const props = nodeProps.split(" ");
					if (
						props.includes("hmd-codeblock") ||
						props.includes("hmd-frontmatter")
					) {
						return false;
					}
				}

				const selection = view.state.selection;

				const overlap = selection.ranges.some((r) => {
					return !(r.to <= decorationFrom || r.from >= decorationTo);
				});

				return !overlap && this.isLivePreview(view.state);
			} catch (e) {
				// If an error occurs, default to not rendering to avoid breaking the editor
				console.warn("Error checking if priority should render", e);
				return false;
			}
		}
	}

	const PriorityViewPluginSpec: PluginSpec<PriorityViewPluginValue> = {
		decorations: (plugin) => {
			try {
				if (plugin.isDestroyed) {
					return Decoration.none;
				}

				return plugin.decorations.update({
					filter: (
						rangeFrom: number,
						rangeTo: number,
						deco: Decoration
					) => {
						try {
							const widget = deco.spec?.widget;
							if ((widget as any).error) {
								return false;
							}

							// Validate range
							if (
								rangeFrom < 0 ||
								rangeTo > plugin.view.state.doc.length ||
								rangeFrom >= rangeTo
							) {
								return false;
							}

							const selection = plugin.view.state.selection;

							// Remove decorations when cursor is inside them
							for (const range of selection.ranges) {
								if (
									!(
										range.to <= rangeFrom ||
										range.from >= rangeTo
									)
								) {
									return false;
								}
							}

							return true;
						} catch (e) {
							console.warn(
								"Error filtering priority decoration",
								e
							);
							return false; // Remove decoration on error
						}
					},
				});
			} catch (e) {
				console.error("Failed to update decorations filter", e);
				return plugin.decorations; // Return current decorations to avoid breaking the editor
			}
		},
	};

	// Create the plugin with our implementation
	const pluginInstance = ViewPlugin.fromClass(
		PriorityViewPluginValue,
		PriorityViewPluginSpec
	);

	return pluginInstance;
}
