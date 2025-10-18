import {
	Modal,
	Notice,
	Setting,
	ButtonComponent,
	setIcon,
	ColorComponent,
} from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import { WorkspaceData } from "@/types/workspace";
import { t } from "@/translations/helper";
import { attachIconMenu } from "@/components/ui/menus/IconMenu";

/**
 * Helper function to create a workspace icon selector
 */
export function createWorkspaceIconSelector(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	initialIcon: string,
	onIconSelected: (iconId: string) => void,
): ButtonComponent {
	const iconButton = new ButtonComponent(containerEl);
	iconButton.setIcon(initialIcon);

	attachIconMenu(iconButton, {
		containerEl,
		plugin,
		onIconSelected: (iconId: string) => {
			iconButton.setIcon(iconId);
			onIconSelected(iconId);
		},
	});

	return iconButton;
}

/**
 * Modal for creating a new workspace
 */
export class CreateWorkspaceModal extends Modal {
	private nameInput: HTMLInputElement;
	private baseSelect: HTMLSelectElement;
	private selectedIcon: string = "layers";
	private selectedColor: string = "#888888";
	private name: string = "";
	private selectWorkspaceId: string = "";

	constructor(
		private plugin: TaskProgressBarPlugin,
		private onCreated: (workspace: WorkspaceData) => void,
	) {
		super(plugin.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("Create New Workspace") });

		// Name input
		new Setting(contentEl)
			.setName(t("Workspace Name"))
			.setDesc(t("A descriptive name for the workspace"))
			.addText((text) => {
				text.setPlaceholder(t("Enter workspace name"))
					.setValue("")
					.onChange((value) => {
						this.name = value;
					});
				this.nameInput = text.inputEl;
			});

		// Icon selection
		const iconSetting = new Setting(contentEl)
			.setName(t("Workspace Icon"))
			.setDesc(t("Choose an icon for this workspace"));

		const iconContainer = iconSetting.controlEl.createDiv({
			cls: "workspace-icon-selector",
		});

		createWorkspaceIconSelector(
			iconContainer,
			this.plugin,
			this.selectedIcon,
			(iconId) => {
				this.selectedIcon = iconId;
			},
		);

		// Color selection
		new Setting(contentEl)
			.setName(t("Workspace Color"))
			.setDesc(t("Choose a color for this workspace"))
			.addColorPicker((color) => {
				color.setValue(this.selectedColor).onChange((value) => {
					this.selectedColor = value;
				});
			});

		// Base workspace selector
		new Setting(contentEl)
			.setName(t("Copy Settings From"))
			.setDesc(t("Copy settings from an existing workspace"))
			.addDropdown((dropdown) => {
				dropdown.addOption("", t("Default settings"));

				const currentWorkspace =
					this.plugin.workspaceManager?.getActiveWorkspace();
				if (currentWorkspace) {
					dropdown.addOption(
						currentWorkspace.id,
						`Current (${currentWorkspace.name})`,
					);
				}

				this.plugin.workspaceManager
					?.getAllWorkspaces()
					.forEach((ws) => {
						if (ws.id !== currentWorkspace?.id) {
							dropdown.addOption(ws.id, ws.name);
						}
					});

				dropdown.onChange((value) => {
					this.selectWorkspaceId = value;
				});

				this.baseSelect = dropdown.selectEl;
			});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		const createButton = buttonContainer.createEl("button", {
			text: t("Create"),
			cls: "mod-cta",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});

		createButton.addEventListener("click", async () => {
			const name = this.name.trim();
			const baseId = this.selectWorkspaceId || undefined;

			if (!name) {
				new Notice(t("Please enter a workspace name"));
				return;
			}

			if (this.plugin.workspaceManager) {
				const workspace =
					await this.plugin.workspaceManager.createWorkspace(
						name,
						baseId,
						this.selectedIcon,
						this.selectedColor,
					);

				new Notice(
					t('Workspace "{{name}}" created', {
						interpolation: { name: name },
					}),
				);

				this.onCreated(workspace);
				this.close();
			}
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});

		// Focus the name input
		this.nameInput.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for renaming a workspace
 */
export class RenameWorkspaceModal extends Modal {
	private nameInput: HTMLInputElement;
	private selectedIcon: string;
	private selectedColor: string;

	constructor(
		private plugin: TaskProgressBarPlugin,
		private workspace: WorkspaceData,
		private onRenamed: () => void,
	) {
		super(plugin.app);
		this.selectedIcon = workspace.icon || "layers";
		this.selectedColor = workspace.color || "#888888";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("Rename Workspace") });

		// Name input
		new Setting(contentEl).setName(t("New Name")).addText((text) => {
			text.setValue(this.workspace.name).setPlaceholder(
				t("Enter new name"),
			);
			this.nameInput = text.inputEl;
		});

		// Icon selection
		const iconSetting = new Setting(contentEl)
			.setName(t("Workspace Icon"))
			.setDesc(t("Choose an icon for this workspace"));

		const iconContainer = iconSetting.controlEl.createDiv({
			cls: "workspace-icon-selector",
		});

		createWorkspaceIconSelector(
			iconContainer,
			this.plugin,
			this.selectedIcon,
			(iconId) => {
				this.selectedIcon = iconId;
			},
		);

		// Color selection
		new Setting(contentEl)
			.setName(t("Workspace Color"))
			.setDesc(t("Choose a color for this workspace"))
			.addColorPicker((color) => {
				color.setValue(this.selectedColor).onChange((value) => {
					this.selectedColor = value;
				});
			});

		// Buttons
		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		const saveButton = buttonContainer.createEl("button", {
			text: t("Save"),
			cls: "mod-cta",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});

		saveButton.addEventListener("click", async () => {
			const newName = this.nameInput.value.trim();

			if (!newName) {
				new Notice(t("Please enter a name"));
				return;
			}

			if (this.plugin.workspaceManager) {
				console.log("[TG-WORKSPACE] modal:rename", {
					id: this.workspace.id,
					name: newName,
					icon: this.selectedIcon,
					color: this.selectedColor,
				});

				await this.plugin.workspaceManager.renameWorkspace(
					this.workspace.id,
					newName,
					this.selectedIcon,
					this.selectedColor,
				);

				new Notice(t("Workspace updated"));
				this.onRenamed();
				this.close();
			}
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});

		// Focus and select the name input
		this.nameInput.focus();
		this.nameInput.select();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for deleting a workspace
 */
export class DeleteWorkspaceModal extends Modal {
	constructor(
		private plugin: TaskProgressBarPlugin,
		private workspace: WorkspaceData,
		private onDeleted: () => void,
	) {
		super(plugin.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: t("Delete Workspace") });

		contentEl.createEl("p", {
			text: t(
				'Are you sure you want to delete "{{name}}"? This action cannot be undone.',
				{ interpolation: { name: this.workspace.name } },
			),
		});

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container",
		});

		const deleteButton = buttonContainer.createEl("button", {
			text: t("Delete"),
			cls: "mod-warning",
		});

		const cancelButton = buttonContainer.createEl("button", {
			text: t("Cancel"),
		});

		deleteButton.addEventListener("click", async () => {
			if (this.plugin.workspaceManager) {
				console.log("[TG-WORKSPACE] modal:delete", {
					id: this.workspace.id,
				});

				await this.plugin.workspaceManager.deleteWorkspace(
					this.workspace.id,
				);

				new Notice(
					t('Workspace "{{name}}" deleted', {
						interpolation: { name: this.workspace.name },
					}),
				);

				this.onDeleted();
				this.close();
			}
		});

		cancelButton.addEventListener("click", () => {
			this.close();
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
