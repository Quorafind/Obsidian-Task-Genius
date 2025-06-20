/**
 * Gantt Chart Group Sidebar Component
 *
 * Displays group headers in a fixed left sidebar that syncs with the main chart scroll.
 * Redesigned with modern Notion/Obsidian-inspired styling.
 */

import { Component, App, setIcon } from "obsidian";
import { TaskGroup } from "../../types/gantt-grouping";
import { t } from "../../translations/helper";

export interface GroupSidebarParams {
	groups: TaskGroup[];
	scrollTop: number;
	totalHeight: number;
	onGroupClick?: (groupId: string) => void;
	onGroupToggle?: (groupId: string) => void;
	onGroupFilter?: (groupId: string, visible: boolean) => void;
	getGroupVisibility?: (groupId: string) => boolean;
}

export class GroupSidebar extends Component {
	private app: App;
	private containerEl: HTMLElement;
	private params: GroupSidebarParams | null = null;
	private sidebarContent: HTMLElement;
	private sidebarHeader: HTMLElement;
	private activeGroupId: string | null = null;
	private collapsedGroups: Set<string> = new Set();
	private groupVisibility: Map<string, boolean> = new Map();

	constructor(app: App, containerEl: HTMLElement) {
		super();
		this.app = app;
		this.containerEl = containerEl;
	}

	onload(): void {
		console.log("GroupSidebar loaded.");
		this.render();
	}

	onunload(): void {
		console.log("GroupSidebar unloaded.");
		this.containerEl.empty();
	}

	updateParams(newParams: GroupSidebarParams): void {
		this.params = newParams;
		this.render();
	}

	private render(): void {
		if (!this.params) return;

		this.containerEl.empty();
		this.containerEl.addClass("tg-gantt-group-sidebar");

		// Create sidebar header
		this.renderHeader();

		// Create scrollable content area
		this.renderContent();
	}

	private renderHeader(): void {
		this.sidebarHeader = this.containerEl.createDiv({
			cls: "tg-gantt-sidebar-header",
		});

		// Header content
		const headerContent = this.sidebarHeader.createDiv({
			cls: "tg-gantt-sidebar-header-content",
		});

		// Title section
		const titleSection = headerContent.createDiv({
			cls: "tg-gantt-sidebar-title-section",
		});

		const iconEl = titleSection.createDiv({
			cls: "tg-gantt-sidebar-icon",
		});
		setIcon(iconEl, "layers");

		titleSection.createEl("h3", {
			cls: "tg-gantt-sidebar-title",
			text: t("Groups"),
		});

		// Stats section
		const statsSection = headerContent.createDiv({
			cls: "tg-gantt-sidebar-stats",
		});

		const totalGroups = this.getTotalGroupCount(this.params!.groups);
		const visibleGroups = this.getVisibleGroupCount(this.params!.groups);

		statsSection.createEl("span", {
			cls: "tg-gantt-sidebar-stat",
			text: `${visibleGroups}/${totalGroups}`,
		});
	}

	private renderContent(): void {
		// Create scrollable content area
		this.sidebarContent = this.containerEl.createDiv({
			cls: "tg-gantt-sidebar-content",
		});

		// Sync scroll position with main chart
		this.sidebarContent.style.transform = `translateY(-${
			this.params!.scrollTop
		}px)`;
		this.sidebarContent.style.height = `${this.params!.totalHeight}px`;

		// Render groups
		if (this.params!.groups.length > 0) {
			this.renderGroups(this.params!.groups, 0);
		} else {
			this.renderEmptyState();
		}
	}

	private renderGroups(groups: TaskGroup[], level: number): void {
		groups.forEach((group) => {
			this.renderGroupItem(group, level);

			// Render subgroups if expanded
			if (
				group.expanded &&
				group.subGroups &&
				group.subGroups.length > 0 &&
				!this.collapsedGroups.has(group.id)
			) {
				this.renderGroups(group.subGroups, level + 1);
			}
		});
	}

	private renderGroupItem(group: TaskGroup, level: number): void {
		const groupItem = this.sidebarContent.createDiv({
			cls: "tg-gantt-sidebar-group-item",
			attr: {
				"data-group-id": group.id,
				"data-level": level.toString(),
			},
		});

		// Add level-specific styling
		groupItem.classList.add(`tg-gantt-sidebar-level-${level}`);

		// Group content container
		const groupContent = groupItem.createDiv({
			cls: "tg-gantt-sidebar-group-content",
		});

		// Expand/collapse icon for collapsible groups
		if (group.subGroups && group.subGroups.length > 0) {
			const iconContainer = groupContent.createDiv({
				cls: "tg-gantt-sidebar-expand-icon",
			});

			const icon = iconContainer.createEl("span", {
				cls: "tg-gantt-sidebar-icon-button",
			});

			const isCollapsed = this.collapsedGroups.has(group.id);
			setIcon(icon, isCollapsed ? "chevron-right" : "chevron-down");

			this.registerDomEvent(iconContainer, "click", (e) => {
				e.stopPropagation();
				this.toggleGroupCollapse(group.id);
				if (this.params?.onGroupToggle) {
					this.params.onGroupToggle(group.id);
				}
			});
		} else {
			// Add spacer for alignment
			// groupContent.createDiv({
			// 	cls: "tg-gantt-sidebar-spacer",
			// });
		}

		// Group label container
		const labelContainer = groupContent.createDiv({
			cls: "tg-gantt-sidebar-label-container",
		});

		// Group label
		labelContainer.createEl("span", {
			cls: "tg-gantt-sidebar-label",
			text: group.label,
		});

		// Group metadata
		const metadataContainer = labelContainer.createDiv({
			cls: "tg-gantt-sidebar-metadata",
		});

		// Task count badge
		const taskCount = this.getGroupTaskCount(group);
		if (taskCount > 0) {
			metadataContainer.createEl("span", {
				cls: "tg-gantt-sidebar-count",
				text: taskCount.toString(),
			});
		}

		// Progress indicator
		const completedTasks = this.getCompletedTaskCount(group);
		if (taskCount > 0) {
			const progressContainer = metadataContainer.createDiv({
				cls: "tg-gantt-sidebar-progress",
			});

			const progressBar = progressContainer.createDiv({
				cls: "tg-gantt-sidebar-progress-bar",
			});

			const progressFill = progressBar.createDiv({
				cls: "tg-gantt-sidebar-progress-fill",
			});

			const progressPercentage = (completedTasks / taskCount) * 100;
			progressFill.style.width = `${progressPercentage}%`;

			// Progress text
			progressContainer.createEl("span", {
				cls: "tg-gantt-sidebar-progress-text",
				text: `${completedTasks}/${taskCount}`,
			});
		}

		// Group actions (visible on hover)
		const actionsContainer = groupContent.createDiv({
			cls: "tg-gantt-sidebar-actions",
		});

		// Filter toggle button
		const filterButton = actionsContainer.createEl("button", {
			cls: "tg-gantt-sidebar-action-button clickable-icon",
			attr: { title: t("Toggle group visibility") },
		});

		const filterIcon = filterButton.createDiv({
			cls: "tg-gantt-sidebar-action-icon",
		});

		// Get current visibility state from the GroupInteractionManager or local state
		const currentVisibility = this.getCurrentGroupVisibility(group.id);
		setIcon(filterIcon, currentVisibility ? "eye" : "eye-off");
		filterButton.setAttribute(
			"title",
			currentVisibility ? t("Hide group") : t("Show group")
		);

		this.registerDomEvent(filterButton, "click", (e) => {
			console.log(
				`GroupSidebar: Filter button clicked for group ${group.id}`
			);
			e.stopPropagation();
			this.toggleGroupFilter(group.id);
		});

		// More options button
		const moreButton = actionsContainer.createEl("button", {
			cls: "tg-gantt-sidebar-action-button clickable-icon",
			attr: { title: t("More options") },
		});

		const moreIcon = moreButton.createDiv({
			cls: "tg-gantt-sidebar-action-icon",
		});
		setIcon(moreIcon, "more-horizontal");

		this.registerDomEvent(moreButton, "click", (e) => {
			console.log(
				`GroupSidebar: More options button clicked for group ${group.id}`
			);
			e.stopPropagation();
			this.showGroupContextMenu(e, group);
		});

		// Add click handler for navigation
		this.registerDomEvent(groupItem, "click", () => {
			this.selectGroup(group.id);
			if (this.params?.onGroupClick) {
				this.params.onGroupClick(group.id);
			}
		});

		// Add hover effects
		this.addHoverEffects(groupItem);

		// Mark as active if selected
		if (this.activeGroupId === group.id) {
			groupItem.addClass("tg-gantt-sidebar-item-active");
		}
	}

	private renderEmptyState(): void {
		const emptyState = this.sidebarContent.createDiv({
			cls: "tg-gantt-sidebar-empty-state",
		});

		const iconEl = emptyState.createDiv({
			cls: "tg-gantt-sidebar-empty-icon",
		});
		setIcon(iconEl, "layers");

		emptyState.createEl("p", {
			cls: "tg-gantt-sidebar-empty-message",
			text: t("No groups available"),
		});

		emptyState.createEl("p", {
			cls: "tg-gantt-sidebar-empty-hint",
			text: t("Configure grouping to organize your tasks"),
		});
	}

	private toggleGroupCollapse(groupId: string): void {
		if (this.collapsedGroups.has(groupId)) {
			this.collapsedGroups.delete(groupId);
		} else {
			this.collapsedGroups.add(groupId);
		}
		this.render(); // Re-render to update collapsed state
	}

	/**
	 * Get current group visibility state, preferring the external source if available
	 */
	private getCurrentGroupVisibility(groupId: string): boolean {
		// First try to get from external source (GroupInteractionManager)
		if (this.params?.getGroupVisibility) {
			return this.params.getGroupVisibility(groupId);
		}
		// Fall back to local state (default to true if not set)
		return this.groupVisibility.get(groupId) ?? true;
	}

	private toggleGroupFilter(groupId: string): void {
		console.log(
			`GroupSidebar: toggleGroupFilter called for group ${groupId}`
		);

		// Get current visibility state
		const currentVisibility = this.getCurrentGroupVisibility(groupId);
		const newVisibility = !currentVisibility;

		// Update local state
		this.groupVisibility.set(groupId, newVisibility);

		// Call the callback if provided
		if (this.params?.onGroupFilter) {
			console.log(
				`GroupSidebar: Calling onGroupFilter with visibility: ${newVisibility}`
			);
			this.params.onGroupFilter(groupId, newVisibility);
		} else {
			console.warn("GroupSidebar: onGroupFilter callback not provided");
		}

		// Update the filter button icon to reflect current state
		this.updateFilterButtonIcon(groupId, newVisibility);
	}

	private selectGroup(groupId: string): void {
		// Remove previous selection
		this.containerEl
			.querySelectorAll(".tg-gantt-sidebar-item-active")
			.forEach((item) => {
				item.removeClass("tg-gantt-sidebar-item-active");
			});

		// Set new selection
		this.activeGroupId = groupId;
		const targetItem = this.containerEl.querySelector(
			`[data-group-id="${groupId}"]`
		);
		if (targetItem) {
			targetItem.addClass("tg-gantt-sidebar-item-active");
		}
	}

	private updateFilterButtonIcon(groupId: string, visible: boolean): void {
		// Find the filter button for this group and update its icon
		const groupItem = this.containerEl.querySelector(
			`[data-group-id="${groupId}"]`
		);
		if (groupItem) {
			const filterButton = groupItem.querySelector(
				".tg-gantt-sidebar-action-button"
			) as HTMLElement;
			if (filterButton) {
				const filterIcon = filterButton.querySelector(
					".tg-gantt-sidebar-action-icon"
				) as HTMLElement;
				if (filterIcon) {
					// Clear existing icon and set new one
					filterIcon.empty();
					setIcon(filterIcon, visible ? "eye" : "eye-off");
					filterButton.setAttribute(
						"title",
						visible ? t("Hide group") : t("Show group")
					);
				}
			}
		}
	}

	private showGroupContextMenu(_event: MouseEvent, group: TaskGroup): void {
		// TODO: Implement context menu
		console.log("Group context menu for:", group.id);
	}

	private getGroupTaskCount(group: TaskGroup): number {
		let count = group.tasks.length;

		if (group.subGroups) {
			count += group.subGroups.reduce(
				(sum, subGroup) => sum + this.getGroupTaskCount(subGroup),
				0
			);
		}

		return count;
	}

	private getCompletedTaskCount(group: TaskGroup): number {
		let count = group.tasks.filter((task) => task.completed).length;

		if (group.subGroups) {
			count += group.subGroups.reduce(
				(sum, subGroup) => sum + this.getCompletedTaskCount(subGroup),
				0
			);
		}

		return count;
	}

	private getTotalGroupCount(groups: TaskGroup[]): number {
		let count = groups.length;
		groups.forEach((group) => {
			if (group.subGroups) {
				count += this.getTotalGroupCount(group.subGroups);
			}
		});
		return count;
	}

	private getVisibleGroupCount(groups: TaskGroup[]): number {
		let count = 0;
		groups.forEach((group) => {
			if (!this.collapsedGroups.has(group.id)) {
				count++;
				if (group.subGroups && group.expanded) {
					count += this.getVisibleGroupCount(group.subGroups);
				}
			}
		});
		return count;
	}

	private addHoverEffects(element: HTMLElement): void {
		this.registerDomEvent(element, "mouseenter", () => {
			element.addClass("tg-gantt-sidebar-item-hover");
		});

		this.registerDomEvent(element, "mouseleave", () => {
			element.removeClass("tg-gantt-sidebar-item-hover");
		});
	}

	/**
	 * Update scroll position to sync with main chart
	 */
	updateScrollPosition(scrollTop: number): void {
		if (this.sidebarContent) {
			this.sidebarContent.style.transform = `translateY(-${scrollTop}px)`;
		}
	}

	/**
	 * Highlight a specific group
	 */
	highlightGroup(groupId: string): void {
		this.selectGroup(groupId);
	}

	/**
	 * Scroll to a specific group
	 */
	scrollToGroup(groupId: string): void {
		const targetItem = this.containerEl.querySelector(
			`[data-group-id="${groupId}"]`
		) as HTMLElement;

		if (targetItem && this.sidebarContent) {
			const itemTop = parseInt(targetItem.style.top) || 0;
			const containerHeight = this.containerEl.clientHeight;
			const itemHeight = parseInt(targetItem.style.height) || 30;

			// Calculate scroll position to center the item
			const scrollTop = Math.max(
				0,
				itemTop - (containerHeight - itemHeight) / 2
			);

			// Update scroll position
			this.updateScrollPosition(scrollTop);

			// Highlight the group
			this.highlightGroup(groupId);
		}
	}

	/**
	 * Expand all groups
	 */
	expandAll(): void {
		this.collapsedGroups.clear();
		this.render();
	}

	/**
	 * Collapse all groups
	 */
	collapseAll(): void {
		if (this.params?.groups) {
			this.addAllGroupsToCollapsed(this.params.groups);
			this.render();
		}
	}

	private addAllGroupsToCollapsed(groups: TaskGroup[]): void {
		groups.forEach((group) => {
			if (group.subGroups && group.subGroups.length > 0) {
				this.collapsedGroups.add(group.id);
				this.addAllGroupsToCollapsed(group.subGroups);
			}
		});
	}

	/**
	 * Get the currently selected group ID
	 */
	getActiveGroupId(): string | null {
		return this.activeGroupId;
	}

	/**
	 * Clear the current selection
	 */
	clearSelection(): void {
		this.activeGroupId = null;
		this.containerEl
			.querySelectorAll(".tg-gantt-sidebar-item-active")
			.forEach((item) => {
				item.removeClass("tg-gantt-sidebar-item-active");
			});
	}
}
