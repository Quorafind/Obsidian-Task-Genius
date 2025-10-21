import { ItemView, WorkspaceLeaf } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import {
	onTaskSelected,
	TaskSelectionPayload,
} from "@/components/features/fluent/events/ui-event";
import { TaskDetailsComponent } from "@/components/features/task/view/details";
import { t } from "@/translations/helper";
import { Repository } from "@/dataflow/indexer/Repository";

export const TG_RIGHT_DETAIL_VIEW_TYPE = "tg-right-detail" as const;

export class RightDetailView extends ItemView {
	private rootEl!: HTMLElement;
	private details!: TaskDetailsComponent;

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: TaskProgressBarPlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
		return TG_RIGHT_DETAIL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Task Genius" + t("Details");
	}

	getIcon(): string {
		return "panel-right-dashed";
	}

	async onOpen() {
		const el = this.containerEl.children[1];
		el.empty();
		this.rootEl = el.createDiv({ cls: "tg-right-detail-view" });

		// Mount TaskDetailsComponent
		this.details = new TaskDetailsComponent(
			this.rootEl,
			this.app,
			this.plugin,
		);
		this.addChild(this.details);
		// this.details.onload();

		// Wire callbacks to WriteAPI
		this.details.onTaskUpdate = async (originalTask, updatedTask) => {
			if (!this.plugin.writeAPI) return;
			await this.plugin.writeAPI.updateTask({
				taskId: originalTask.id,
				updates: updatedTask,
			});
		};
		this.details.onTaskToggleComplete = async (task) => {
			if (!this.plugin.writeAPI) return;
			await this.plugin.writeAPI.updateTaskStatus({
				taskId: task.id,
				completed: !task.completed,
			});
		};

		// Subscribe to cross-view task selection
		this.registerEvent(
			onTaskSelected(this.app, async (payload: TaskSelectionPayload) => {
				// Filter by active workspace correctly
				console.log(this.app, payload);
				try {
					const activeId =
						this.plugin.workspaceManager?.getActiveWorkspace().id;
					console.log(activeId, payload.workspaceId);
					if (
						payload.workspaceId &&
						activeId &&
						payload.workspaceId !== activeId
					)
						return;
				} catch {}

				// Reveal this leaf on selection
				if (payload.taskId) this.app.workspace.revealLeaf(this.leaf);

				if (!payload.taskId) {
					this.details.showTaskDetails(null as never);
					return;
				}
				try {
					const repo =
						this.plugin.dataflowOrchestrator?.getRepository();
					const task =
						repo &&
						(await (repo as Repository).getTaskById(
							payload.taskId,
						));

					console.log(task);
					if (task) this.details.showTaskDetails(task);
				} catch (e) {
					console.warn("[TG] RightDetailView failed to load task", e);
				}
			}),
		);
	}

	async onClose() {
		// cleanup handled by Component lifecycle
	}
}
