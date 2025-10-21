import { setIcon } from "obsidian";
import { t } from "@/translations/helper";

/**
 * Factory class for creating component previews with mock data
 */
export class ComponentPreviewFactory {
	/**
	 * Create a preview of the fluent Sidebar component
	 */
	static createSidebarPreview(container: HTMLElement): void {
		container.addClass("tg-fluent-container", "component-preview-sidebar");

		const sidebar = container.createDiv({
			cls: "fluent-sidebar component-preview",
		});

		// Header with workspace selector
		const header = sidebar.createDiv({ cls: "fluent-sidebar-header" });

		// Workspace selector with correct structure
		const workspaceSelectorEl = header.createDiv();
		const workspaceSelector = workspaceSelectorEl.createDiv({
			cls: "workspace-selector",
		});
		const workspaceButton = workspaceSelector.createDiv({
			cls: "workspace-selector-button",
		});

		const workspaceInfo = workspaceButton.createDiv({
			cls: "workspace-info",
		});
		const workspaceIcon = workspaceInfo.createDiv({
			cls: "workspace-icon",
		});
		workspaceIcon.style.backgroundColor = "#3498db";
		setIcon(workspaceIcon, "layers");

		const workspaceDetails = workspaceInfo.createDiv({
			cls: "workspace-details",
		});
		const nameContainer = workspaceDetails.createDiv({
			cls: "workspace-name-container",
		});
		nameContainer.createSpan({
			text: t("Personal"),
			cls: "workspace-name",
		});
		workspaceDetails.createDiv({
			text: t("Workspace"),
			cls: "workspace-label",
		});

		const dropdownIcon = workspaceButton.createDiv({
			cls: "workspace-dropdown-icon",
		});
		setIcon(dropdownIcon, "chevron-down");

		// New task button
		const newTaskBtn = header.createEl("button", {
			cls: "fluent-new-task-btn",
			text: t("New Task"),
		});
		setIcon(newTaskBtn.createDiv({ cls: "fluent-new-task-icon" }), "plus");

		// Main navigation area
		const content = sidebar.createDiv({ cls: "fluent-sidebar-content" });

		// Primary navigation section
		const primarySection = content.createDiv({
			cls: "fluent-sidebar-section fluent-sidebar-section-primary",
		});
		const primaryList = primarySection.createDiv({
			cls: "fluent-navigation-list",
		});

		const primaryItems = [
			{ id: "inbox", label: t("Inbox"), icon: "inbox", badge: 5 },
			{ id: "today", label: t("Today"), icon: "calendar-days", badge: 3 },
			{
				id: "upcoming",
				label: t("Upcoming"),
				icon: "calendar",
				badge: 8,
			},
			{ id: "flagged", label: t("Flagged"), icon: "flag", badge: 2 },
		];

		primaryItems.forEach((item, index) => {
			const navItem = primaryList.createDiv({
				cls: "fluent-navigation-item",
				attr: {
					"data-view-id": item.id,
					tabindex: "0",
					role: "button",
				},
			});
			if (index === 0) navItem.addClass("is-active");

			const icon = navItem.createDiv({ cls: "fluent-navigation-icon" });
			setIcon(icon, item.icon);
			navItem.createSpan({
				text: item.label,
				cls: "fluent-navigation-label",
			});
			if (item.badge && item.badge > 0) {
				navItem.createDiv({
					text: item.badge.toString(),
					cls: "fluent-navigation-badge",
				});
			}
		});

		// Projects section
		const projectsSection = content.createDiv({
			cls: "fluent-sidebar-section fluent-sidebar-section-projects",
		});
		const projectsHeader = projectsSection.createDiv({
			cls: "fluent-section-header",
		});
		projectsHeader.createSpan({ text: t("Projects") });

		const buttonContainer = projectsHeader.createDiv({
			cls: "fluent-project-header-buttons",
		});
		const treeToggleBtn = buttonContainer.createDiv({
			cls: "fluent-tree-toggle-btn",
			attr: { "aria-label": t("Toggle tree/list view") },
		});
		setIcon(treeToggleBtn, "list");

		const sortProjectBtn = buttonContainer.createDiv({
			cls: "fluent-sort-project-btn",
			attr: { "aria-label": t("Sort projects") },
		});
		setIcon(sortProjectBtn, "arrow-up-down");

		// Project list
		const projectListEl = projectsSection.createDiv();
		const projectList = projectListEl.createDiv({
			cls: "fluent-project-list",
		});
		const scrollArea = projectList.createDiv({
			cls: "fluent-project-scroll",
		});

		// Mock projects
		const projects = [
			{ id: "work", name: t("Work"), color: "#3b82f6", count: 12 },
			{ id: "personal", name: t("Personal"), color: "#10b981", count: 5 },
			{ id: "learning", name: t("Learning"), color: "#f59e0b", count: 3 },
		];

		projects.forEach((project) => {
			const projectItem = scrollArea.createDiv({
				cls: "fluent-project-item",
				attr: {
					"data-project-id": project.id,
					"data-level": "0",
					tabindex: "0",
					role: "button",
				},
			});
			const colorDot = projectItem.createDiv({
				cls: "fluent-project-color",
			});
			colorDot.style.backgroundColor = project.color;
			projectItem.createSpan({
				text: project.name,
				cls: "fluent-project-name",
			});
			projectItem.createSpan({
				text: project.count.toString(),
				cls: "fluent-project-count",
			});
		});

		// Other views section
		const otherSection = content.createDiv({
			cls: "fluent-sidebar-section fluent-sidebar-section-other",
		});
		const otherHeader = otherSection.createDiv({
			cls: "fluent-section-header",
		});
		otherHeader.createSpan({ text: t("Other Views") });

		const otherList = otherSection.createDiv({
			cls: "fluent-navigation-list",
		});
		const otherItems = [
			{ id: "calendar", label: t("Calendar"), icon: "calendar" },
			{ id: "gantt", label: t("Gantt"), icon: "git-branch" },
			{ id: "tags", label: t("Tags"), icon: "tag" },
		];

		otherItems.forEach((item) => {
			const navItem = otherList.createDiv({
				cls: "fluent-navigation-item",
				attr: {
					"data-view-id": item.id,
					tabindex: "0",
					role: "button",
				},
			});
			const icon = navItem.createDiv({ cls: "fluent-navigation-icon" });
			setIcon(icon, item.icon);
			navItem.createSpan({
				text: item.label,
				cls: "fluent-navigation-label",
			});
		});

		// Interactive preview: simple selection toggle (visual only)
		const root = container.querySelector(".fluent-sidebar")!;
		const handleActivate = (target: HTMLElement) => {
			const item = target.closest<HTMLElement>(
				".fluent-navigation-item, .fluent-project-item",
			);
			if (!item) return;
			const parentList = item.parentElement;
			if (!parentList) return;
			// Clear previous active in the same group
			Array.from(parentList.children).forEach((el) =>
				el.classList.remove("is-active"),
			);
			item.classList.add("is-active");
		};

		root.addEventListener("click", (e) => {
			handleActivate(e.target as HTMLElement);
		});
		root.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" || e.key === " ") {
				const target = e.target as HTMLElement;
				handleActivate(target);
				// Prevent page scroll on Space
				e.preventDefault();
			}
		});
	}

	/**
	 * Create a preview of the fluent TopNavigation component
	 */
	static createTopNavigationPreview(container: HTMLElement): void {
		container.addClass("tg-fluent-container", "component-preview-topnav");

		const topNav = container.createDiv({
			cls: "fluent-top-navigation component-preview",
		});

		// Left section - Search
		const leftSection = topNav.createDiv({ cls: "fluent-nav-left" });
		const searchContainer = leftSection.createDiv({
			cls: "fluent-search-container",
		});

		// Match SearchComponent structure
		const searchInputContainer = searchContainer.createDiv({
			cls: "search-input-container",
		});
		const searchInput = searchInputContainer.createEl("input", {
			type: "text",
			placeholder: t("Search tasks, projects ..."),
			cls: "search-input",
			attr: { disabled: "true" },
		});

		// Center section - View mode tabs
		const centerSection = topNav.createDiv({ cls: "fluent-nav-center" });
		const viewTabs = centerSection.createDiv({ cls: "fluent-view-tabs" });

		const modes = [
			{ id: "list", label: t("List"), icon: "list" },
			{ id: "kanban", label: t("Kanban"), icon: "layout-grid" },
			{ id: "tree", label: t("Tree"), icon: "git-branch" },
			{ id: "calendar", label: t("Calendar"), icon: "calendar" },
		];

		modes.forEach((mode, index) => {
			const tab = viewTabs.createEl("button", {
				cls: ["fluent-view-tab", "clickable-icon"],
				attr: { "data-mode": mode.id },
			});
			if (index === 0) tab.addClass("is-active");

			const icon = tab.createDiv({ cls: "fluent-view-tab-icon" });
			setIcon(icon, mode.icon);
			tab.createSpan({ text: mode.label });
		});

		// Right section - Notifications and Settings
		const rightSection = topNav.createDiv({ cls: "fluent-nav-right" });

		// Notification button
		const notificationBtn = rightSection.createDiv({
			cls: "fluent-nav-icon-button",
		});
		setIcon(notificationBtn, "bell");
		const badge = notificationBtn.createDiv({
			cls: "fluent-notification-badge",
			text: "3",
		});

		// Settings button
		const settingsBtn = rightSection.createDiv({
			cls: "fluent-nav-icon-button",
		});
		setIcon(settingsBtn, "settings");
	}

	/**
	 * Create a preview of the content area with task list
	 */
	static createContentAreaPreview(container: HTMLElement): void {
		container.addClass("tg-fluent-container", "component-preview-content");

		const content = container.createDiv({
			cls: "task-content component-preview",
		});

		// Content header
		const header = content.createDiv({ cls: "content-header" });

		// View title
		const titleEl = header.createDiv({
			cls: "content-title",
			text: t("Inbox"),
		});

		// Task count
		const countEl = header.createDiv({
			cls: "task-count",
			text: `5 ${t("tasks")}`,
		});

		// Filter controls
		const filterEl = header.createDiv({ cls: "content-filter" });
		const filterInput = filterEl.createEl("input", {
			cls: "filter-input",
			attr: {
				type: "text",
				placeholder: t("Filter tasks..."),
				disabled: "true",
			},
		});

		// View toggle button
		const viewToggleBtn = header.createDiv({ cls: "view-toggle-btn" });
		setIcon(viewToggleBtn, "list");
		viewToggleBtn.setAttribute("aria-label", t("Toggle list/tree view"));

		// Task list
		const taskList = content.createDiv({ cls: "task-list" });

		const mockTasks = [
			{
				title: t("Review project proposal"),
				priority: "high",
				project: "Work",
			},
			{
				title: t("Update documentation"),
				priority: "medium",
				project: "Work",
			},
			{ title: t("Buy groceries"), priority: "low", project: "Personal" },
			{
				title: t("Finish online course"),
				priority: "medium",
				project: "Learning",
			},
			{
				title: t("Schedule team meeting"),
				priority: "high",
				project: "Work",
			},
		];

		mockTasks.forEach((task) => {
			const taskItem = taskList.createDiv({ cls: "task-item" });

			const checkbox = taskItem.createDiv({ cls: "task-checkbox" });
			setIcon(checkbox, "circle");

			const taskContent = taskItem.createDiv({ cls: "task-content" });
			taskContent.createSpan({ text: task.title, cls: "task-title" });

			const taskMeta = taskContent.createDiv({ cls: "task-meta" });
			if (task.priority) {
				const priorityBadge = taskMeta.createSpan({
					cls: `task-priority priority-${task.priority}`,
				});
				priorityBadge.createSpan({ text: task.priority });
			}
			if (task.project) {
				const projectBadge = taskMeta.createSpan({
					cls: "task-project",
				});
				projectBadge.createSpan({ text: task.project });
			}
		});
	}

	/**
	 * Create a preview of the project popover
	 */
	static createProjectPopoverPreview(container: HTMLElement): void {
		container.addClass("tg-fluent-container", "component-preview-popover");

		const popover = container.createDiv({
			cls: "project-popover component-preview",
		});

		// Popover header
		const header = popover.createDiv({ cls: "popover-header" });
		const colorDot = header.createSpan({ cls: "project-color-large" });
		colorDot.style.backgroundColor = "#3b82f6";

		const headerContent = header.createDiv({
			cls: "popover-header-content",
		});
		headerContent.createEl("h3", { text: t("Work") });
		headerContent.createSpan({
			text: `12 ${t("tasks")}`,
			cls: "project-task-count",
		});

		// Popover stats
		const stats = popover.createDiv({ cls: "popover-stats" });
		const statsItems = [
			{ label: t("Active"), value: "8" },
			{ label: t("Completed"), value: "24" },
			{ label: t("Overdue"), value: "2" },
		];

		statsItems.forEach((stat) => {
			const statItem = stats.createDiv({ cls: "stat-item" });
			statItem.createDiv({ text: stat.value, cls: "stat-value" });
			statItem.createDiv({ text: stat.label, cls: "stat-label" });
		});

		// Quick actions
		const actions = popover.createDiv({ cls: "popover-actions" });
		const actionButtons = [
			{ label: t("View All"), icon: "eye" },
			{ label: t("Add Task"), icon: "plus" },
			{ label: t("Settings"), icon: "settings" },
		];

		actionButtons.forEach((action) => {
			const btn = actions.createDiv({ cls: "popover-action-btn" });
			const icon = btn.createSpan();
			setIcon(icon, action.icon);
			btn.createSpan({ text: action.label });
		});
	}
}
