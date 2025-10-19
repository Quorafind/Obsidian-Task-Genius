import { Workspace, WorkspaceLeaf } from "obsidian";
import TaskProgressBarPlugin from "@/index";
import { FluentTaskView, FLUENT_TASK_VIEW } from "@/pages/FluentTaskView";
import {
	LeftSidebarView,
	TG_LEFT_SIDEBAR_VIEW_TYPE,
} from "@/pages/LeftSidebarView";
import {
	RightDetailView,
	TG_RIGHT_DETAIL_VIEW_TYPE,
} from "@/pages/RightDetailView";
import { t } from "@/translations/helper";
import { TASK_VIEW_TYPE } from "@/pages/TaskView";

export class FluentIntegration {
	private plugin: TaskProgressBarPlugin;
	private revealingSideLeaves = false;

	constructor(plugin: TaskProgressBarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Register Fluent view and commands
	 */
	public register() {
		// Only register if experimental features are enabled
		if (!this.isFluentEnabled()) {
			return;
		}

		// Register the Fluent view
		this.plugin.registerView(
			FLUENT_TASK_VIEW,
			(leaf: WorkspaceLeaf) => new FluentTaskView(leaf, this.plugin),
		);

		if (this.plugin.settings.fluentView?.useWorkspaceSideLeaves) {
			this.plugin.registerView(
				TG_LEFT_SIDEBAR_VIEW_TYPE,
				(leaf: WorkspaceLeaf) => new LeftSidebarView(leaf, this.plugin),
			);
			this.plugin.registerView(
				TG_RIGHT_DETAIL_VIEW_TYPE,
				(leaf: WorkspaceLeaf) => new RightDetailView(leaf, this.plugin),
			);
		}
		// Register side leaf views for new architecture

		// When any of the fluent views becomes active, reveal the other side leaves without focusing them
		this.plugin.registerEvent(
			this.plugin.app.workspace.on("active-leaf-change", async (leaf) => {
				if (this.revealingSideLeaves) return;
				const useSideLeaves =
					!!this.plugin.settings.fluentView?.useWorkspaceSideLeaves;
				if (!useSideLeaves || !leaf?.view?.getViewType) return;
				const vt = leaf.view.getViewType();
				const watched = new Set<string>([
					FLUENT_TASK_VIEW,
					TG_LEFT_SIDEBAR_VIEW_TYPE,
					TG_RIGHT_DETAIL_VIEW_TYPE,
				]);
				if (!watched.has(vt)) return;
				const ws = this.plugin.app.workspace as Workspace & any;
				this.revealingSideLeaves = true;
				try {
					// Ensure side leaves exist
					const leftLeaf = await ws.ensureSideLeaf(
						TG_LEFT_SIDEBAR_VIEW_TYPE,
						"left",
						{ active: false },
					);
					const rightLeaf = await ws.ensureSideLeaf(
						TG_RIGHT_DETAIL_VIEW_TYPE,
						"right",
						{ active: false },
					);
					// Bring them to front within their splits (without keeping focus)
					if (leftLeaf) ws.revealLeaf(leftLeaf);
					if (rightLeaf) ws.revealLeaf(rightLeaf);
					// Expand sidebars if they are collapsed
					if (
						ws.leftSplit?.collapsed &&
						typeof ws.leftSplit.expand === "function"
					)
						ws.leftSplit.expand();
					if (
						ws.rightSplit?.collapsed &&
						typeof ws.rightSplit.expand === "function"
					)
						ws.rightSplit.expand();
					// Restore focus to the currently active (incoming) leaf
					if (ws.setActiveLeaf && leaf)
						ws.setActiveLeaf(leaf, { focus: true });
				} catch (_) {
					// noop
				} finally {
					this.revealingSideLeaves = false;
				}
			}),
		);
	}

	/**
	 * Open the Fluent view
	 */
	private async openFluentView() {
		const { workspace } = this.plugin.app;

		// Check if Fluent view is already open
		const leaves = workspace.getLeavesOfType(FLUENT_TASK_VIEW);
		if (leaves.length > 0) {
			// Focus existing view
			workspace.revealLeaf(leaves[0]);
			// Ensure side leaves if configured
			await this.ensureSideLeavesIfEnabled();
			return;
		}

		// Create new Fluent view
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({
			type: FLUENT_TASK_VIEW,
			active: true,
		});

		workspace.revealLeaf(leaf);

		// Ensure side leaves if configured
		await this.ensureSideLeavesIfEnabled();
	}

	private async ensureSideLeavesIfEnabled() {
		const useSideLeaves =
			!!this.plugin.settings.fluentView?.useWorkspaceSideLeaves;
		if (!useSideLeaves) {
			const leftSidebarLeaves = this.plugin.app.workspace.getLeavesOfType(
				TG_LEFT_SIDEBAR_VIEW_TYPE,
			);
			if (leftSidebarLeaves.length > 0) {
				this.plugin.app.workspace.detachLeavesOfType(
					TG_LEFT_SIDEBAR_VIEW_TYPE,
				);
			}
			const rightSidebarLeaves =
				this.plugin.app.workspace.getLeavesOfType(
					TG_RIGHT_DETAIL_VIEW_TYPE,
				);
			if (rightSidebarLeaves.length > 0) {
				this.plugin.app.workspace.detachLeavesOfType(
					TG_RIGHT_DETAIL_VIEW_TYPE,
				);
			}
		}

		const ws = this.plugin.app.workspace as Workspace;
		// Left sidebar
		await ws.ensureSideLeaf(TG_LEFT_SIDEBAR_VIEW_TYPE, "left", {
			active: false,
		});
		await ws.ensureSideLeaf(TG_RIGHT_DETAIL_VIEW_TYPE, "right", {
			active: false,
		});
	}

	/**
	 * Check if Fluent features are enabled
	 */
	private isFluentEnabled(): boolean {
		return this.plugin.settings.fluentView?.enableFluent ?? false;
	}

	/**
	 * Migrate settings from V1 to V2
	 */
	public async migrateSettings() {
		if (!this.plugin.settings.fluentView) {
			this.plugin.settings.fluentView = {
				enableFluent: false,
			};
		}

		// Default workspace configuration
		if (!this.plugin.settings.fluentView.workspaces) {
			this.plugin.settings.fluentView.workspaces = [
				{ id: "default", name: t("Default"), color: "#3498db" },
			];
		}

		// Default Fluent configuration
		if (this.plugin.settings.fluentView.fluentConfig === undefined) {
			this.plugin.settings.fluentView.fluentConfig = {
				enableWorkspaces: true,
				defaultWorkspace: "default",
				maxOtherViewsBeforeOverflow: 5,
			};
		}

		// Backfill extra experimental flag without touching types
		const fluentSetting = this.plugin.settings.fluentView;
		if (fluentSetting.useWorkspaceSideLeaves === undefined)
			fluentSetting.useWorkspaceSideLeaves = false;

		await this.plugin.saveSettings();
	}

	/**
	 * Toggle between V1 and Fluent views
	 */
	public async toggleVersion() {
		const { workspace } = this.plugin.app;

		// Close all V1 views
		const v1Leaves = workspace.getLeavesOfType(TASK_VIEW_TYPE);
		v1Leaves.forEach((leaf) => leaf.detach());

		// Close all Fluent views
		const v2Leaves = workspace.getLeavesOfType(FLUENT_TASK_VIEW);
		v2Leaves.forEach((leaf) => leaf.detach());

		// Toggle the setting
		if (!this.plugin.settings.fluentView) {
			this.plugin.settings.fluentView = {
				enableFluent: false,
			};
		}
		this.plugin.settings.fluentView.enableFluent =
			!this.plugin.settings.fluentView.enableFluent;
		await this.plugin.saveSettings();

		// Open the appropriate view
		if (this.plugin.settings.fluentView?.enableFluent) {
			await this.openFluentView();
		} else {
			// Open V1 view
			const leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: TASK_VIEW_TYPE,
				active: true,
			});
			workspace.revealLeaf(leaf);
		}
	}
}
