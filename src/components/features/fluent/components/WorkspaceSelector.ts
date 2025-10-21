import { Menu, setIcon } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import { WorkspaceData } from "@/types/workspace";
import { t } from "@/translations/helper";
import {
	CreateWorkspaceModal,
	RenameWorkspaceModal,
	DeleteWorkspaceModal,
} from "@/components/ui/modals/WorkspaceModals";

export class WorkspaceSelector {
	private containerEl: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private currentWorkspaceId: string;
	private onWorkspaceChange: (workspaceId: string) => void;
	private selectorButton: HTMLDivElement | null = null;
	private workspaceIconEl: HTMLDivElement | null = null;
	private workspaceNameEl: HTMLSpanElement | null = null;
	private workspaceLabelEl: HTMLDivElement | null = null;

	constructor(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		onWorkspaceChange: (workspaceId: string) => void,
	) {
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.currentWorkspaceId =
			plugin.workspaceManager?.getActiveWorkspace().id || "";
		this.onWorkspaceChange = onWorkspaceChange;

		this.initialize();
		this.updateActiveWorkspaceView();
	}

	private initialize() {
		this.containerEl.empty();
		this.containerEl.addClass("workspace-selector");

		if (!this.plugin.workspaceManager) return;

		this.selectorButton = this.containerEl.createDiv({
			cls: "workspace-selector-button",
		});

		const workspaceInfo = this.selectorButton.createDiv({
			cls: "workspace-info",
		});

		this.workspaceIconEl = workspaceInfo.createDiv({
			cls: "workspace-icon",
		});

		const workspaceDetails = workspaceInfo.createDiv({
			cls: "workspace-details",
		});

		const nameContainer = workspaceDetails.createDiv({
			cls: "workspace-name-container",
		});

		this.workspaceNameEl = nameContainer.createSpan({
			cls: "workspace-name",
		});

		this.workspaceLabelEl = workspaceDetails.createDiv({
			cls: "workspace-label",
			text: t("Workspace"),
		});

		const dropdownIcon = this.selectorButton.createDiv({
			cls: "workspace-dropdown-icon",
		});
		setIcon(dropdownIcon, "chevron-down");

		this.selectorButton.addEventListener("click", (event) => {
			event.preventDefault();
			this.showWorkspaceMenu(event);
		});
	}

	private updateActiveWorkspaceView() {
		if (!this.plugin.workspaceManager) return;

		if (!this.selectorButton) {
			this.initialize();
			if (!this.selectorButton) return;
		}

		const workspace = this.plugin.workspaceManager.getActiveWorkspace();
		if (!workspace) return;

		this.currentWorkspaceId = workspace.id;

		if (this.workspaceIconEl) {
			this.workspaceIconEl.style.backgroundColor =
				this.getWorkspaceColor(workspace);
			setIcon(this.workspaceIconEl, workspace.icon || "layers");
		}

		if (this.workspaceNameEl) {
			this.workspaceNameEl.setText(workspace.name);
		}
	}

	private getWorkspaceColor(workspace: WorkspaceData): string {
		// Generate a color based on workspace ID or use predefined colors
		const colors = [
			"#e74c3c",
			"#3498db",
			"#2ecc71",
			"#f39c12",
			"#9b59b6",
			"#1abc9c",
			"#34495e",
			"#e67e22",
		];
		const index =
			Math.abs(
				workspace.id
					.split("")
					.reduce((acc, char) => acc + char.charCodeAt(0), 0)
			) % colors.length;
		return colors[index];
	}

	private showWorkspaceMenu(event: MouseEvent) {
		if (!this.plugin.workspaceManager) return;

		const menu = new Menu();
		const workspaces = this.plugin.workspaceManager.getAllWorkspaces();
		const currentWorkspace =
			this.plugin.workspaceManager.getActiveWorkspace();

		// Add workspace items
		workspaces.forEach((workspace) => {
			menu.addItem((item) => {
				const isDefault =
					this.plugin.workspaceManager?.isDefaultWorkspace(
						workspace.id
					);
				const title = isDefault ? `${workspace.name}` : workspace.name;

				item.setTitle(title)
					.setIcon(workspace.icon || "layers")
					.onClick(async () => {
						if (workspace.id === this.currentWorkspaceId) {
							return;
						}
						await this.onWorkspaceChange(workspace.id);
						this.currentWorkspaceId = workspace.id;
						this.updateActiveWorkspaceView();
					});

				if (workspace.id === currentWorkspace.id) {
					item.setChecked(true);
				}
			});
		});

		menu.addSeparator();

		// Add management options
		menu.addItem((item) => {
			item.setTitle(t("Create Workspace"))
				.setIcon("plus")
				.onClick(() => {
					this.showCreateWorkspaceDialog();
				});
		});

		// Only show rename/delete for non-default workspaces
		if (
			!this.plugin.workspaceManager.isDefaultWorkspace(
				currentWorkspace.id,
			)
		) {
			menu.addItem((item) => {
				item.setTitle(t("Rename Current Workspace"))
					.setIcon("edit")
					.onClick(() => {
						this.showRenameWorkspaceDialog(currentWorkspace);
					});
			});

			menu.addItem((item) => {
				item.setTitle(t("Delete Current Workspace"))
					.setIcon("trash")
					.onClick(() => {
						this.showDeleteWorkspaceDialog(currentWorkspace);
					});
			});
		}

		menu.addSeparator();

		menu.addItem((item) => {
			item.setTitle(t("Manage Workspaces..."))
				.setIcon("settings")
				.onClick(() => {
					// Open settings to workspace tab
					// @ts-ignore
					this.plugin.app.setting.open();
					// @ts-ignore
					this.plugin.app.setting.openTabById(
						"obsidian-task-progress-bar"
					);

					setTimeout(() => {
						if (this.plugin.settingTab) {
							this.plugin.settingTab.openTab("workspaces");
						}
					}, 100);
			});
		});

		menu.showAtMouseEvent(event);
	}

	private showCreateWorkspaceDialog() {
		new CreateWorkspaceModal(this.plugin, (workspace) => {
			this.onWorkspaceChange(workspace.id);
			this.currentWorkspaceId = workspace.id;
			this.updateActiveWorkspaceView();
		}).open();
	}

	private showRenameWorkspaceDialog(workspace: WorkspaceData) {
		new RenameWorkspaceModal(this.plugin, workspace, () => {
			this.updateActiveWorkspaceView();
		}).open();
	}

	private showDeleteWorkspaceDialog(workspace: WorkspaceData) {
		new DeleteWorkspaceModal(this.plugin, workspace, () => {
			// After deletion, workspace manager will automatically switch to default
			this.currentWorkspaceId =
				this.plugin.workspaceManager?.getActiveWorkspace().id || "";
			this.updateActiveWorkspaceView();
		}).open();
	}

	public setWorkspace(workspaceId: string) {
		if (workspaceId === this.currentWorkspaceId) return;
		this.currentWorkspaceId = workspaceId;
		this.updateActiveWorkspaceView();
	}
}
