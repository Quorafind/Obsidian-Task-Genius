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
import { App, setTooltip } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { Annotation } from "@codemirror/state";
// @ts-ignore - This import is necessary but TypeScript can't find it
import { syntaxTree, tokenClassNodeProp } from "@codemirror/language";
import { t } from "../translations/helper";
import {
	extractWorkflowInfo,
	resolveWorkflowInfo,
	determineNextStage,
} from "./workflow";
import { taskStatusChangeAnnotation } from "./taskStatusSwitcher";
import { Range } from "@codemirror/state";
import { RegExpCursor } from "@codemirror/search";
import { setIcon } from "obsidian";
import "../styles/workflow.css";

// Annotation that marks a transaction as a workflow decorator change
export const workflowDecoratorAnnotation = Annotation.define<string>();

/**
 * Widget that displays a workflow stage indicator emoji
 */
class WorkflowStageWidget extends WidgetType {
	constructor(
		private app: App,
		private plugin: TaskProgressBarPlugin,
		private view: EditorView,
		private from: number,
		private to: number,
		private workflowType: string,
		private stageId: string,
		private subStageId?: string
	) {
		super();
	}

	eq(other: WorkflowStageWidget): boolean {
		return (
			other.workflowType === this.workflowType &&
			other.stageId === this.stageId &&
			other.subStageId === this.subStageId
		);
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = "cm-workflow-stage-indicator";

		// Get stage icon and type
		const { icon, stageType } = this.getStageIconAndType();
		setIcon(span.createSpan(), icon);
		span.setAttribute("data-stage-type", stageType);

		// Add tooltip
		const tooltipContent = this.generateTooltipContent();
		setTooltip(span, tooltipContent);

		// Add click handler for stage transitions
		span.addEventListener("click", (e) => {
			this.handleClick(e);
		});

		return span;
	}

	private getStageIconAndType(): { icon: string; stageType: string } {
		// Find the workflow definition
		const workflow = this.plugin.settings.workflow.definitions.find(
			(wf) => wf.id === this.workflowType
		);

		if (!workflow) {
			return { icon: "help-circle", stageType: "unknown" }; // Unknown workflow
		}

		// Find the current stage
		const stage = workflow.stages.find((s) => s.id === this.stageId);
		if (!stage) {
			return { icon: "help-circle", stageType: "unknown" }; // Unknown stage
		}

		// Return icon and type based on stage type
		switch (stage.type) {
			case "linear":
				return { icon: "arrow-right", stageType: "linear" };
			case "cycle":
				return { icon: "rotate-cw", stageType: "cycle" };
			case "terminal":
				return { icon: "check", stageType: "terminal" };
			default:
				return { icon: "circle", stageType: "default" };
		}
	}

	private generateTooltipContent(): string {
		// Find the workflow definition
		const workflow = this.plugin.settings.workflow.definitions.find(
			(wf) => wf.id === this.workflowType
		);

		if (!workflow) {
			return t("Workflow not found");
		}

		// Find the current stage
		const stage = workflow.stages.find((s) => s.id === this.stageId);
		if (!stage) {
			return t("Stage not found");
		}

		let content = `${t("Workflow")}: ${workflow.name}\n`;

		if (this.subStageId) {
			const subStage = stage.subStages?.find(
				(ss) => ss.id === this.subStageId
			);
			if (subStage) {
				content += `${t("Current stage")}: ${stage.name} (${
					subStage.name
				})\n`;
			} else {
				content += `${t("Current stage")}: ${stage.name}\n`;
			}
		} else {
			content += `${t("Current stage")}: ${stage.name}\n`;
		}

		content += `${t("Type")}: ${stage.type}`;

		// Add next stage info if available
		if (stage.type !== "terminal") {
			if (stage.next) {
				const nextStage = workflow.stages.find(
					(s) => s.id === stage.next
				);
				if (nextStage) {
					content += `\n${t("Next")}: ${nextStage.name}`;
				}
			} else if (stage.canProceedTo && stage.canProceedTo.length > 0) {
				const nextStage = workflow.stages.find(
					(s) => s.id === stage.canProceedTo![0]
				);
				if (nextStage) {
					content += `\n${t("Next")}: ${nextStage.name}`;
				}
			}
		}

		return content;
	}

	private handleClick(event: MouseEvent): void {
		event.preventDefault();
		event.stopPropagation();

		// Get the active editor
		const activeLeaf = this.app.workspace.activeLeaf;
		if (
			!activeLeaf ||
			!activeLeaf.view ||
			!(activeLeaf.view as any).editor
		) {
			return;
		}

		const editor = (activeLeaf.view as any).editor;

		// Get the line containing this workflow marker
		const line = this.view.state.doc.lineAt(this.from);
		const lineText = line.text;

		// Resolve workflow information
		const resolvedInfo = resolveWorkflowInfo(
			lineText,
			this.view.state.doc,
			line.number,
			this.plugin
		);

		if (!resolvedInfo) {
			return;
		}

		const { currentStage, workflow, currentSubStage } = resolvedInfo;

		// Determine next stage
		let nextStageId: string;
		let nextSubStageId: string | undefined;

		if (currentStage.type === "terminal") {
			// Terminal stages don't transition
			return;
		} else if (currentStage.type === "cycle" && currentSubStage) {
			// Handle substage transitions
			if (currentSubStage.next) {
				nextStageId = currentStage.id;
				nextSubStageId = currentSubStage.next;
			} else if (
				currentStage.canProceedTo &&
				currentStage.canProceedTo.length > 0
			) {
				nextStageId = currentStage.canProceedTo[0];
				nextSubStageId = undefined;
			} else {
				// Cycle back to first substage
				nextStageId = currentStage.id;
				nextSubStageId = currentStage.subStages?.[0]?.id;
			}
		} else if (
			currentStage.canProceedTo &&
			currentStage.canProceedTo.length > 0
		) {
			// Use canProceedTo for stage jumping
			nextStageId = currentStage.canProceedTo[0];
		} else if (currentStage.next) {
			// Use explicit next stage
			nextStageId = Array.isArray(currentStage.next)
				? currentStage.next[0]
				: currentStage.next;
		} else {
			// Find next stage in sequence
			const currentIndex = workflow.stages.findIndex(
				(s) => s.id === currentStage.id
			);
			if (
				currentIndex >= 0 &&
				currentIndex < workflow.stages.length - 1
			) {
				nextStageId = workflow.stages[currentIndex + 1].id;
			} else {
				// No next stage
				return;
			}
		}

		// Find the next stage object
		const nextStage = workflow.stages.find((s) => s.id === nextStageId);
		if (!nextStage) {
			return;
		}

		// Create the new stage marker
		let newMarker: string;
		if (nextSubStageId) {
			newMarker = `[stage::${nextStageId}.${nextSubStageId}]`;
		} else {
			newMarker = `[stage::${nextStageId}]`;
		}

		// Replace the current stage marker
		const stageMarkerRegex = /\[stage::[^\]]+\]/;
		const match = lineText.match(stageMarkerRegex);

		if (match && match.index !== undefined) {
			const from = line.from + match.index;
			const to = from + match[0].length;

			editor.cm.dispatch({
				changes: {
					from,
					to,
					insert: newMarker,
				},
			});
		}
	}

	ignoreEvent(): boolean {
		return false;
	}
}

/**
 * Creates an editor extension that decorates workflow stage markers with interactive indicators
 * @param app The Obsidian app instance
 * @param plugin The plugin instance
 * @returns An editor extension that can be registered with the plugin
 */
export function workflowDecoratorExtension(
	app: App,
	plugin: TaskProgressBarPlugin
) {
	// Don't enable if workflow feature is disabled
	if (!plugin.settings.workflow.enableWorkflow) {
		return [];
	}

	return ViewPlugin.fromClass(
		class implements PluginValue {
			decorations: DecorationSet = Decoration.none;

			constructor(public view: EditorView) {
				this.updateDecorations();
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.selectionSet
				) {
					this.updateDecorations();
				}
			}

			destroy(): void {
				this.decorations = Decoration.none;
			}

			private updateDecorations(): void {
				const decorations: Range<Decoration>[] = [];

				for (const { from, to } of this.view.visibleRanges) {
					// Search for workflow tags and stage markers
					const workflowCursor = new RegExpCursor(
						this.view.state.doc,
						"(#workflow\\/[^\\/\\s]+|\\[stage::[^\\]]+\\])",
						{},
						from,
						to
					);

					while (!workflowCursor.next().done) {
						const { from: matchFrom, to: matchTo } =
							workflowCursor.value;
						console.log("Match found:", matchFrom, matchTo);
						if (!this.shouldRender(matchFrom, matchTo)) {
							continue;
						}

						const line = this.view.state.doc.lineAt(matchFrom);
						const lineText = line.text;
						console.log("Line text:", lineText);

						// Check if this line contains a task - 修改正则表达式以支持更灵活的任务格式
						// 原来的正则只匹配以任务标记开头的行，现在改为检查整行是否包含任务标记
						const taskRegex = /^([\s|\t]*)([-*+]|\d+\.)\s+\[(.)]/;
						const hasTaskMarker = /\[([ xX\-])\]/.test(lineText);

						// 如果既不是标准任务格式，也没有任务标记，则跳过
						if (!taskRegex.test(lineText) && !hasTaskMarker) {
							console.log("No task marker found in line");
							continue;
						}

						// Extract workflow information
						const workflowInfo = extractWorkflowInfo(lineText);
						if (!workflowInfo) {
							console.log("No workflow info extracted");
							continue;
						}

						// Resolve complete workflow information
						const resolvedInfo = resolveWorkflowInfo(
							lineText,
							this.view.state.doc,
							line.number,
							plugin
						);

						if (!resolvedInfo) {
							console.log("Failed to resolve workflow info");
							continue;
						}

						const { workflowType, currentStage, currentSubStage } =
							resolvedInfo;

						console.log(
							"Creating decoration for:",
							workflowType,
							currentStage.id
						);

						// Add decoration after the matched text
						const decoration = Decoration.widget({
							widget: new WorkflowStageWidget(
								app,
								plugin,
								this.view,
								matchFrom,
								matchTo,
								workflowType,
								currentStage.id,
								currentSubStage?.id
							),
							side: 1,
						});

						decorations.push(decoration.range(matchTo, matchTo));
					}
				}

				this.decorations = Decoration.set(
					decorations.sort((a, b) => a.from - b.from)
				);
			}

			private shouldRender(from: number, to: number): boolean {
				try {
					// Check if we're in a code block or frontmatter
					const syntaxNode = syntaxTree(this.view.state).resolveInner(
						from + 1
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

					// Don't render if cursor overlaps with the decoration area
					const selection = this.view.state.selection;
					const overlap = selection.ranges.some((range) => {
						return !(range.to <= from || range.from >= to);
					});

					return !overlap;
				} catch (e) {
					console.warn(
						"Error checking if workflow decorator should render",
						e
					);
					return false;
				}
			}
		},
		{
			decorations: (plugin) => plugin.decorations,
		}
	);
}
