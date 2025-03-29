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
import { App, editorLivePreviewField, Menu, MenuItem, moment } from "obsidian";
import TaskProgressBarPlugin from "..";
import { Annotation } from "@codemirror/state";
// @ts-ignore - This import is necessary but TypeScript can't find it
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";

export const dateChangeAnnotation = Annotation.define();

class DatePickerWidget extends WidgetType {
	constructor(
		readonly app: App,
		readonly plugin: TaskProgressBarPlugin,
		readonly view: EditorView,
		readonly from: number,
		readonly to: number,
		readonly currentDate: string,
		readonly dateMark: string
	) {
		super();
	}

	eq(other: DatePickerWidget): boolean {
		return (
			this.from === other.from &&
			this.to === other.to &&
			this.currentDate === other.currentDate
		);
	}

	toDOM(): HTMLElement {
		const wrapper = createEl("span", {
			cls: "date-picker-widget",
			attr: {
				"aria-label": "Task Date",
			},
		});

		const dateText = createSpan({
			cls: "task-date",
			text: this.currentDate,
		});

		// Handle click to show date menu
		dateText.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.showDateMenu(e);
		});

		wrapper.appendChild(dateText);
		return wrapper;
	}

	private showDateMenu(e: MouseEvent) {
		const menu = new Menu();

		// Add date option using moment
		const addDateOption = (
			amount: number,
			unit: moment.unitOfTime.DurationConstructor,
			label: string
		) => {
			menu.addItem((item: MenuItem) => {
				item.setTitle(label);
				item.setIcon("calendar");
				item.onClick(() => {
					const date = moment().add(amount, unit);
					const formattedDate = date.format("YYYY-MM-DD");
					this.setDate(`${this.dateMark} ${formattedDate}`);
				});
			});
		};

		menu.addItem((item: MenuItem) => {
			item.setTitle("From now");
			item.setDisabled(true);
		});
		// Add all date options
		addDateOption(1, "days", "Tomorrow");
		addDateOption(2, "days", "In 2 days");
		addDateOption(3, "days", "In 3 days");
		addDateOption(5, "days", "In 5 days");
		addDateOption(1, "weeks", "In 1 week");
		addDateOption(10, "days", "In 10 days");
		addDateOption(2, "weeks", "In 2 weeks");
		addDateOption(1, "months", "In 1 month");
		addDateOption(2, "months", "In 2 months");
		addDateOption(3, "months", "In 3 months");
		addDateOption(6, "months", "In 6 months");
		addDateOption(1, "years", "In 1 year");
		addDateOption(5, "years", "In 5 years");
		addDateOption(10, "years", "In 10 years");

		menu.showAtMouseEvent(e);
	}

	private setDate(date: string) {
		const transaction = this.view.state.update({
			changes: { from: this.from, to: this.to, insert: date },
			annotations: [dateChangeAnnotation.of(true)],
		});

		this.view.dispatch(transaction);
	}
}

export function datePickerExtension(app: App, plugin: TaskProgressBarPlugin) {
	// Don't enable if the setting is off
	if (!plugin.settings.enableDatePicker) {
		return [];
	}

	class DatePickerViewPluginValue implements PluginValue {
		public readonly view: EditorView;
		public readonly plugin: TaskProgressBarPlugin;
		decorations: DecorationSet = Decoration.none;
		private lastUpdate: number = 0;
		private readonly updateThreshold: number = 30; // Reduced threshold for quicker updates

		// Date matcher
		private readonly dateMatch = new MatchDecorator({
			regexp: new RegExp(
				`(${plugin.settings.dateMark
					.split(",")
					.join("|")}) \\d{4}-\\d{2}-\\d{2}`,
				"g"
			),
			decorate: (
				add,
				from: number,
				to: number,
				match: RegExpExecArray,
				view: EditorView
			) => {
				if (!this.shouldRender(view, from, to)) {
					return;
				}

				add(
					from,
					to,
					Decoration.replace({
						widget: new DatePickerWidget(
							app,
							plugin,
							view,
							from,
							to,
							match[0],
							match[1]
						),
					})
				);
			},
		});

		constructor(view: EditorView) {
			this.view = view;
			this.plugin = plugin;
			this.updateDecorations(view);
		}

		update(update: ViewUpdate): void {
			// More aggressive updates to handle content changes
			if (
				update.docChanged ||
				update.viewportChanged ||
				update.selectionSet ||
				update.transactions.some((tr) =>
					tr.annotation(dateChangeAnnotation)
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
						if (this.view) {
							this.updateDecorations(this.view);
						}
					}, this.updateThreshold);
				}
			}
		}

		destroy(): void {
			// No specific cleanup needed
		}

		updateDecorations(view: EditorView, update?: ViewUpdate) {
			// Only apply in live preview mode
			if (!this.isLivePreview(view.state)) return;

			// Check if we can incrementally update, otherwise do a full recreation
			if (update && !update.docChanged && this.decorations.size > 0) {
				try {
					this.decorations = this.dateMatch.updateDeco(
						update,
						this.decorations
					);
				} catch (e) {
					console.warn(
						"Error updating date decorations, recreating all",
						e
					);
					this.decorations = this.dateMatch.createDeco(view);
				}
			} else {
				this.decorations = this.dateMatch.createDeco(view);
			}
		}

		isLivePreview(state: EditorView["state"]): boolean {
			return state.field(editorLivePreviewField);
		}

		shouldRender(
			view: EditorView,
			decorationFrom: number,
			decorationTo: number
		) {
			// Skip checking in code blocks or frontmatter
			try {
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

				// Avoid rendering over selected text
				const overlap = selection.ranges.some((r) => {
					return !(r.to <= decorationFrom || r.from >= decorationTo);
				});

				return !overlap && this.isLivePreview(view.state);
			} catch (e) {
				// If error in checking, default to not rendering to avoid breaking the editor
				console.warn("Error checking if date should render", e);
				return false;
			}
		}
	}

	const DatePickerViewPluginSpec: PluginSpec<DatePickerViewPluginValue> = {
		decorations: (plugin) => {
			try {
				return plugin.decorations.update({
					filter: (
						rangeFrom: number,
						rangeTo: number,
						deco: Decoration
					) => {
						const widget = deco.spec?.widget;
						if ((widget as any).error) {
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
					},
				});
			} catch (e) {
				// If error in filtering, return current decorations to avoid breaking the editor
				console.warn("Error filtering date decorations", e);
				return plugin.decorations;
			}
		},
	};

	// Create the plugin with our implementation
	const pluginInstance = ViewPlugin.fromClass(
		DatePickerViewPluginValue,
		DatePickerViewPluginSpec
	);

	return pluginInstance;
}
