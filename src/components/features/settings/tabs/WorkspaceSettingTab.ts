import { Menu, Setting, setIcon } from "obsidian";
import { TaskProgressBarSettingTab } from "@/setting";
import TaskProgressBarPlugin from "@/index";
import { WorkspaceData, ModuleDefinition } from "@/types/workspace";
import { t } from "@/translations/helper";
import {
	CreateWorkspaceModal,
	RenameWorkspaceModal,
	DeleteWorkspaceModal,
} from "@/components/ui/modals/WorkspaceModals";

export function renderWorkspaceSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement,
) {
	const workspacesSection = containerEl.createDiv();
	workspacesSection.addClass("workspaces-settings-section");

	// Section header
	const headerEl = workspacesSection.createEl("h2");
	headerEl.setText(t("Workspace Management"));
	headerEl.addClass("workspaces-section-heading");

	// Description
	const descEl = workspacesSection.createDiv();
	descEl.addClass("workspaces-description");
	descEl.setText(
		t(
			"Manage workspaces to organize different contexts with their own settings and filters.",
		),
	);

	if (!settingTab.plugin.workspaceManager) {
		const warningEl = workspacesSection.createDiv();
		warningEl.addClass("workspaces-warning");
		warningEl.setText(t("Workspace manager is not available."));
		return;
	}

	// Current workspace info
	const currentWorkspace =
		settingTab.plugin.workspaceManager.getActiveWorkspace();
	const isDefault = settingTab.plugin.workspaceManager.isDefaultWorkspace(
		currentWorkspace.id,
	);

	new Setting(workspacesSection)
		.setName(t("Current Workspace"))
		.setDesc(
			`${currentWorkspace.name}${
				isDefault ? " (" + t("Default") + ")" : ""
			}`,
		)
		.addButton((button) => {
			button.setButtonText(t("Switch Workspace")).onClick((evt) => {
				showWorkspaceSelector(settingTab, evt);
			});
		});

	// Workspace list
	const allWorkspaces = settingTab.plugin.workspaceManager.getAllWorkspaces();

	const workspaceListEl = workspacesSection.createDiv();
	workspaceListEl.addClass("workspace-list");

	const listHeaderEl = workspaceListEl.createEl("h3");
	listHeaderEl.setText(t("All Workspaces"));

	allWorkspaces.forEach((workspace) => {
		const workspaceItemEl = workspaceListEl.createDiv();
		workspaceItemEl.addClass("workspace-item");

		const isCurrentActive = workspace.id === currentWorkspace.id;
		const isDefaultWs =
			settingTab.plugin.workspaceManager!.isDefaultWorkspace(
				workspace.id,
			);

		if (isCurrentActive) {
			workspaceItemEl.addClass("workspace-item-active");
		}

		const setting = new Setting(workspaceItemEl);

		// Add workspace icon to the name
		const nameWithIcon = setting.nameEl.createDiv({
			cls: "workspace-name-with-icon",
		});
		const iconEl = nameWithIcon.createDiv({ cls: "workspace-list-icon" });
		setIcon(iconEl, workspace.icon || "layers");
		nameWithIcon.createSpan({ text: workspace.name });

		setting
			.setDesc(
				isDefaultWs
					? t("Default workspace")
					: t("Last updated: {{date}}", {
							interpolation: {
								date: new Date(
									workspace.updatedAt,
								).toLocaleDateString(),
							},
						}),
			)
			.addButton((button) => {
				if (isCurrentActive) {
					button.setButtonText(t("Active")).setDisabled(true);
				} else {
					button.setButtonText(t("Switch")).onClick(async () => {
						console.log("[TG-WORKSPACE] settings:switch", {
							to: workspace.id,
						});
						await settingTab.plugin.workspaceManager!.setActiveWorkspace(
							workspace.id,
						);
						settingTab.display();
					});
				}
			})
			.addButton((button) => {
				button
					.setIcon("settings-2")
					.setTooltip(t("Configure hidden modules"))
					.onClick(() => {
						showHiddenModulesConfig(
							settingTab,
							workspace,
							workspaceItemEl,
						);
					});
			})
			.addButton((button) => {
				button
					.setIcon("edit")
					.setTooltip(t("Rename"))
					.onClick(() => {
						showRenameWorkspaceDialog(settingTab, workspace);
					});
			})
			.addButton((button) => {
				if (isDefaultWs) {
					button
						.setIcon("trash")
						.setTooltip(t("Default workspace cannot be deleted"));
					button.setDisabled(true);
				} else {
					button
						.setIcon("trash")
						.setTooltip(t("Delete"))
						.onClick(() => {
							showDeleteWorkspaceDialog(settingTab, workspace);
						});
				}
			});
	});

	// Create new workspace button
	new Setting(workspacesSection)
		.setName(t("Create New Workspace"))
		.setDesc(t("Create a new workspace with custom settings"))
		.addButton((button) => {
			button
				.setButtonText(t("Create"))
				.setCta()
				.onClick(() => {
					showCreateWorkspaceDialog(settingTab);
				});
		});
}

function showWorkspaceSelector(
	settingTab: TaskProgressBarSettingTab,
	event: MouseEvent,
) {
	if (!settingTab.plugin.workspaceManager) return;

	const menu = new Menu();
	const workspaces = settingTab.plugin.workspaceManager.getAllWorkspaces();
	const currentWorkspace =
		settingTab.plugin.workspaceManager.getActiveWorkspace();

	workspaces.forEach((workspace) => {
		menu.addItem((item) => {
			item.setTitle(workspace.name)
				.setIcon("layers")
				.onClick(async () => {
					await settingTab.plugin.workspaceManager?.setActiveWorkspace(
						workspace.id,
					);
					console.log("[TG-WORKSPACE] settings:menu switch", {
						to: workspace.id,
					});

					this.display();
				});

			if (workspace.id === currentWorkspace.id) {
				item.setChecked(true);
			}
		});
	});

	menu.showAtMouseEvent(event);
}

function showCreateWorkspaceDialog(settingTab: TaskProgressBarSettingTab) {
	if (!settingTab.plugin.workspaceManager) return;

	new CreateWorkspaceModal(settingTab.plugin, () => {
		settingTab.display();
	}).open();
}

function showRenameWorkspaceDialog(
	settingTab: TaskProgressBarSettingTab,
	workspace: WorkspaceData,
) {
	if (!settingTab.plugin.workspaceManager) return;

	new RenameWorkspaceModal(settingTab.plugin, workspace, () => {
		settingTab.display();
	}).open();
}

function showDeleteWorkspaceDialog(
	settingTab: TaskProgressBarSettingTab,
	workspace: WorkspaceData,
) {
	if (!settingTab.plugin.workspaceManager) return;

	new DeleteWorkspaceModal(settingTab.plugin, workspace, () => {
		settingTab.display();
	}).open();
}

/**
 * Get all available modules that can be hidden
 */
function getAvailableModules(plugin: TaskProgressBarPlugin): {
	views: ModuleDefinition[];
	sidebarComponents: ModuleDefinition[];
	features: ModuleDefinition[];
} {
	// Get view modules from plugin settings
	const views: ModuleDefinition[] = plugin.settings.viewConfiguration.map(
		(view) => ({
			id: view.id,
			name: view.name,
			icon: view.icon,
			type: "view" as const,
		}),
	);

	// Define sidebar component modules
	const sidebarComponents: ModuleDefinition[] = [
		{
			id: "projects-list",
			name: t("Projects List"),
			icon: "folders",
			type: "sidebar" as const,
		},
		{
			id: "tags-list",
			name: t("Tags List"),
			icon: "tag",
			type: "sidebar" as const,
		},
		{
			id: "view-switcher",
			name: t("View Switcher"),
			icon: "layout-list",
			type: "sidebar" as const,
		},
		{
			id: "top-views",
			name: t("Top Views Area"),
			icon: "layout-top",
			type: "sidebar" as const,
		},
		{
			id: "bottom-views",
			name: t("Bottom Views Area"),
			icon: "layout-bottom",
			type: "sidebar" as const,
		},
	];

	// Define feature component modules
	const features: ModuleDefinition[] = [
		{
			id: "details-panel",
			name: t("Details Panel"),
			icon: "panel-right",
			type: "feature" as const,
		},
		{
			id: "quick-capture",
			name: t("Quick Capture"),
			icon: "notebook-pen",
			type: "feature" as const,
		},
		{
			id: "filter",
			name: t("Filter"),
			icon: "filter",
			type: "feature" as const,
		},
		{
			id: "progress-bar",
			name: t("Progress Bar"),
			icon: "percent",
			type: "feature" as const,
		},
		{
			id: "task-mark",
			name: t("Task Count"),
			icon: "hash",
			type: "feature" as const,
		},
	];

	return { views, sidebarComponents, features };
}

/**
 * Render hidden modules configuration for a workspace
 */
function renderHiddenModulesConfig(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	workspace: WorkspaceData,
	onUpdate: () => void,
) {
	const modulesContainer = containerEl.createDiv({
		cls: "workspace-hidden-modules-container",
	});

	// Title
	const titleEl = modulesContainer.createDiv({
		cls: "workspace-hidden-modules-title",
	});
	setIcon(titleEl.createSpan(), "eye-off");
	titleEl.createSpan({ text: t("Hidden Modules Configuration") });

	// Description
	modulesContainer.createDiv({
		cls: "workspace-hidden-modules-desc",
		text: t(
			"Configure which modules should be hidden in this workspace. Hidden views will not appear in the sidebar, and hidden features will be disabled.",
		),
	});

	const modules = getAvailableModules(plugin);
	const hiddenModules = workspace.settings.hiddenModules || {
		views: [],
		sidebarComponents: [],
		features: [],
	};

	const groupsContainer = modulesContainer.createDiv({
		cls: "workspace-module-groups",
	});

	// Helper function to render a module group
	const renderModuleGroup = (
		groupTitle: string,
		groupIcon: string,
		moduleList: ModuleDefinition[],
		hiddenList: string[],
		moduleType: "views" | "sidebarComponents" | "features",
	) => {
		const groupEl = groupsContainer.createDiv({
			cls: "workspace-module-group",
		});

		// Group header
		const headerEl = groupEl.createDiv({
			cls: "workspace-module-group-header",
		});
		const iconEl = headerEl.createDiv({
			cls: "workspace-module-group-icon",
		});
		setIcon(iconEl, groupIcon);
		headerEl.createDiv({
			cls: "workspace-module-group-title",
			text: groupTitle,
		});

		const hiddenCount = hiddenList.length;
		const totalCount = moduleList.length;
		headerEl.createDiv({
			cls: "workspace-module-group-count",
			text: t("{{hidden}}/{{total}} hidden", {
				interpolation: {
					hidden: hiddenCount.toString(),
					total: totalCount.toString(),
				},
			}),
		});

		// Module list
		const listEl = groupEl.createDiv({ cls: "workspace-module-list" });

		moduleList.forEach((module) => {
			const isHidden = hiddenList.includes(module.id);
			const itemEl = listEl.createDiv({ cls: "workspace-module-item" });
			if (isHidden) {
				itemEl.addClass("is-hidden");
			}

			// Checkbox
			const checkboxContainer = itemEl.createDiv({
				cls: "workspace-module-checkbox",
			});
			const checkbox = checkboxContainer.createEl("input", {
				type: "checkbox",
			});
			checkbox.checked = !isHidden; // Checked means visible (not hidden)

			// Icon
			const iconContainer = itemEl.createDiv({
				cls: "workspace-module-icon",
			});
			setIcon(iconContainer, module.icon);

			// Label
			itemEl.createDiv({
				cls: "workspace-module-label",
				text: module.name,
			});

			// Toggle handler
			const toggleVisibility = () => {
				const newHiddenList = [...hiddenList];
				const index = newHiddenList.indexOf(module.id);

				if (checkbox.checked && index !== -1) {
					// Remove from hidden list (make visible)
					newHiddenList.splice(index, 1);
					itemEl.removeClass("is-hidden");
				} else if (!checkbox.checked && index === -1) {
					// Add to hidden list (make hidden)
					newHiddenList.push(module.id);
					itemEl.addClass("is-hidden");
				}

				// Update workspace settings
				if (!workspace.settings.hiddenModules) {
					workspace.settings.hiddenModules = {
						views: [],
						sidebarComponents: [],
						features: [],
					};
				}
				workspace.settings.hiddenModules[moduleType] = newHiddenList;

				// Save and trigger update
				plugin.workspaceManager?.updateWorkspace(
					workspace.id,
					workspace,
				);
				onUpdate();

				// Update count badge
				const countBadge = headerEl.querySelector(
					".workspace-module-group-count",
				);
				if (countBadge) {
					countBadge.textContent = t("{{hidden}}/{{total}} hidden", {
						interpolation: {
							hidden: newHiddenList.length.toString(),
							total: totalCount.toString(),
						},
					});
				}
			};

			checkbox.addEventListener("change", toggleVisibility);
			itemEl.addEventListener("click", (e) => {
				if (e.target !== checkbox) {
					checkbox.checked = !checkbox.checked;
					toggleVisibility();
				}
			});
		});
	};

	// Render all module groups
	renderModuleGroup(
		t("Views"),
		"layout-list",
		modules.views,
		hiddenModules.views || [],
		"views",
	);

	renderModuleGroup(
		t("Sidebar Components"),
		"sidebar",
		modules.sidebarComponents,
		hiddenModules.sidebarComponents || [],
		"sidebarComponents",
	);

	renderModuleGroup(
		t("Features"),
		"settings",
		modules.features,
		hiddenModules.features || [],
		"features",
	);
}

/**
 * Show or hide hidden modules configuration for a workspace
 */
function showHiddenModulesConfig(
	settingTab: TaskProgressBarSettingTab,
	workspace: WorkspaceData,
	workspaceItemEl: HTMLElement,
) {
	// Check if config is already shown
	const existingConfig = workspaceItemEl.querySelector(
		".workspace-hidden-modules-container",
	);

	if (existingConfig) {
		// Remove if already shown (toggle off)
		existingConfig.remove();
		return;
	}

	// Render the config using the new CSS class-based approach
	renderHiddenModulesConfig(
		workspaceItemEl,
		settingTab.plugin,
		workspace,
		() => {
			// Update callback - trigger any necessary refreshes
			console.log(
				`[WorkspaceSettings] Hidden modules updated for workspace ${workspace.id}`,
			);
		},
	);
}
