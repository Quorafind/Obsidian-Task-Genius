/**
 * Obsidian URI Handler for Task Genius
 * Handles custom URI scheme: obsidian://task-genius/...
 */

import { App, Modal, Notice } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";

export interface UriParams {
	action?: string;
	tab?: string;
	section?: string;
	search?: string;
	[key: string]: string | undefined;
}

export class ObsidianUriHandler {
	private plugin: TaskProgressBarPlugin;

	constructor(plugin: TaskProgressBarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Register the URI handler with Obsidian
	 */
	register(): void {
		// Register the main handler
		this.plugin.registerObsidianProtocolHandler(
			"task-genius",
			async (params: UriParams) => {
				await this.handleUri(params);
			},
		);

		// Register specific action handlers for direct path access
		// This allows both formats: obsidian://task-genius?action=settings
		// and obsidian://task-genius/settings
		const actions = ["settings", "create-task", "open-view"];
		for (const action of actions) {
			this.plugin.registerObsidianProtocolHandler(
				`task-genius/${action}`,
				async (params: UriParams) => {
					// Set the action explicitly since it's in the path
					await this.handleUri({ ...params, action });
				},
			);
		}
	}

	/**
	 * Handle incoming URI requests
	 */
	private async handleUri(params: UriParams): Promise<void> {
		const { action } = params;

		// Default to settings action if not specified
		const uriAction = action || "settings";

		switch (uriAction) {
			case "settings":
				await this.handleSettingsUri(params);
				break;
			case "create-task":
				await this.handleCreateTaskUri(params);
				break;
			case "open-view":
				await this.handleOpenViewUri(params);
				break;
			default:
				new Notice(t("Unknown URI action: ") + uriAction);
		}
	}

	/**
	 * Handle settings-related URI
	 * Example: obsidian://task-genius/settings?tab=mcp-integration&action=enable
	 */
	private async handleSettingsUri(params: UriParams): Promise<void> {
		const { tab, section, search } = params;

		// Open settings
		const settings = (this.plugin.app as any).setting;
		settings.open();
		settings.openTabById(this.plugin.manifest.id);

		// Wait for settings to be ready
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Navigate to specific tab if provided
		if (tab) {
			this.navigateToSettingsTab(tab, section, search);
		}

		// Handle specific actions
		if (params.action) {
			await this.handleSettingsAction(params.action, tab);
		}
	}

	/**
	 * Navigate to a specific settings tab
	 */
	private navigateToSettingsTab(
		tabName: string,
		section?: string,
		search?: string,
	): void {
		// Use the settingTab's navigation method if available
		if (this.plugin.settingTab && this.plugin.settingTab.navigateToTab) {
			this.plugin.settingTab.navigateToTab(tabName, section, search);
			return;
		}

		// Fallback: Map tab names to tab indices or identifiers
		const tabMap: Record<string, string> = {
			general: "general",
			index: "index",
			"view-settings": "view-settings",
			"file-filter": "file-filter",
			"progress-bar": "progress-bar",
			"task-status": "task-status",
			"task-handler": "task-handler",
			workflow: "workflow",
			reward: "reward",
			habit: "habit",
			"mcp-integration": "mcp-integration",
			ics: "ics",
			"time-parsing": "time-parsing",
			"beta-test": "beta-test",
			about: "about",
		};

		const tabId = tabMap[tabName];
		if (!tabId) {
			new Notice(t("Unknown settings tab: ") + tabName);
			return;
		}

		// Fallback implementation
		const modal = (this.plugin.app as any).setting.activeTab;
		if (!modal) return;

		// Find and click the tab
		const tabButtons = modal.containerEl.querySelectorAll(".settings-tab");
		tabButtons.forEach((button: HTMLElement) => {
			const buttonText = button.textContent?.toLowerCase();
			if (buttonText && buttonText.includes(tabName.replace("-", " "))) {
				button.click();

				// If there's a section, try to scroll to it
				if (section) {
					setTimeout(() => {
						this.scrollToSection(section);
					}, 200);
				}

				// If there's a search term, try to focus the search
				if (search) {
					setTimeout(() => {
						this.performSettingsSearch(search);
					}, 300);
				}
			}
		});
	}

	/**
	 * Scroll to a specific section within the settings
	 */
	private scrollToSection(sectionId: string): void {
		const modal = (this.plugin.app as App).setting.activeTab;
		if (!modal) return;

		// Look for section headers
		const headers = modal.containerEl.querySelectorAll("h3, h4");
		headers.forEach((header: HTMLElement) => {
			const headerText = header.textContent?.toLowerCase();
			if (
				headerText &&
				headerText.includes(sectionId.replace("-", " "))
			) {
				header.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		});

		// Special handling for specific sections
		if (sectionId === "cursor") {
			// Look for Cursor configuration section
			const cursorSection = modal.containerEl.querySelector(
				".mcp-client-section",
			);
			if (cursorSection) {
				const header =
					cursorSection.querySelector(".mcp-client-header");
				if (header && header.textContent?.includes("Cursor")) {
					// Click to expand
					(header as HTMLElement).click();
					cursorSection.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
				}
			}
		}
	}

	/**
	 * Perform a search in the settings
	 */
	private performSettingsSearch(searchTerm: string): void {
		const modal = (this.plugin.app as App).setting?.activeTab;
		if (!modal) return;

		// Find the search input
		const searchInput = modal.containerEl.querySelector(
			"input[type='search'], input.search-input",
		) as HTMLInputElement;

		if (searchInput) {
			searchInput.value = searchTerm;
			searchInput.dispatchEvent(new Event("input", { bubbles: true }));
			searchInput.focus();
		}
	}

	/**
	 * Handle specific actions within settings
	 */
	private async handleSettingsAction(
		action: string,
		tab?: string,
	): Promise<void> {
		// Wait for settings to be fully loaded
		await new Promise((resolve) => setTimeout(resolve, 500));

		const modal = (this.plugin.app as App).setting.activeTab;
		if (!modal) return;

		switch (action) {
			case "enable":
				if (tab === "mcp-integration") {
					// Find and click the enable toggle
					const toggle = modal.containerEl.querySelector(
						".setting-item:has(.setting-item-name:contains('Enable MCP Server')) .checkbox-container input",
					) as HTMLInputElement;
					if (toggle && !toggle.checked) {
						toggle.click();
					}
				}
				break;

			case "test":
				if (tab === "mcp-integration") {
					// Find and click the test button
					const testButton = Array.from(
						modal.containerEl.querySelectorAll("button"),
					).find((btn) => btn.textContent === t("Test"));
					if (testButton) {
						(testButton as HTMLButtonElement).click();
					}
				}
				break;

			case "regenerate-token":
				if (tab === "mcp-integration") {
					// Find and click the regenerate button
					const regenerateButton = Array.from(
						modal.containerEl.querySelectorAll("button"),
					).find((btn) => btn.textContent === t("Regenerate"));
					if (regenerateButton) {
						(regenerateButton as HTMLButtonElement).click();
					}
				}
				break;
		}
	}

	/**
	 * Handle create task URI
	 * Example: obsidian://task-genius/create-task?content=My%20Task&project=Work
	 */
	private async handleCreateTaskUri(params: UriParams): Promise<void> {
		const {
			content,
			project,
			context,
			tags,
			priority,
			dueDate,
			startDate,
		} = params;

		if (!content) {
			new Notice(t("Task content is required"));
			return;
		}

		// Parse tags if provided as comma-separated
		const taskTags = tags ? tags.split(",").map((t) => t.trim()) : [];

		// Create the task using WriteAPI
		try {
			if (!this.plugin.writeAPI) {
				new Notice(t("Task system not initialized"));
				return;
			}

			// Get the daily note or create in inbox
			const dailyNotePath =
				this.plugin.app.workspace.getActiveFile()?.path ||
				`Daily/${new Date().toISOString().split("T")[0]}.md`;

			await this.plugin.writeAPI.createTask({
				content: decodeURIComponent(content),
				project: project ? decodeURIComponent(project) : undefined,
				context: context ? decodeURIComponent(context) : undefined,
				tags: taskTags,
				priority: priority ? parseInt(priority) : undefined,
				dueDate: dueDate || undefined,
				startDate: startDate || undefined,
				filePath: dailyNotePath,
			});

			new Notice(t("Task created successfully"));
		} catch (error) {
			console.error("Failed to create task from URI:", error);
			new Notice(t("Failed to create task"));
		}
	}

	/**
	 * Handle open view URI
	 * Example: obsidian://task-genius/open-view?type=inbox
	 */
	private async handleOpenViewUri(params: UriParams): Promise<void> {
		const { type } = params;

		if (!type) {
			new Notice(t("View type is required"));
			return;
		}

		// Map view types to leaf types
		const viewMap: Record<string, string> = {
			inbox: "task-progress-bar-view",
			forecast: "task-progress-bar-view",
			project: "task-progress-bar-view",
			tag: "task-progress-bar-view",
			review: "task-progress-bar-view",
			calendar: "task-progress-bar-view",
			gantt: "task-progress-bar-view",
			kanban: "task-progress-bar-view",
			matrix: "task-progress-bar-view",
			table: "task-progress-bar-view",
		};

		const leafType = viewMap[type];
		if (!leafType) {
			new Notice(t("Unknown view type: ") + type);
			return;
		}

		// Open the view
		const leaf = this.plugin.app.workspace.getLeaf(true);
		await leaf.setViewState({
			type: leafType,
			state: { viewType: type },
		});

		this.plugin.app.workspace.revealLeaf(leaf);
	}

	/**
	 * Generate URI for settings
	 * Uses the cleaner path format: obsidian://task-genius/settings?tab=...
	 */
	static generateSettingsUri(
		tab?: string,
		section?: string,
		action?: string,
		search?: string,
	): string {
		const params = new URLSearchParams();
		if (tab) params.set("tab", tab);
		if (section) params.set("section", section);
		if (action) params.set("action", action);
		if (search) params.set("search", search);

		const queryString = params.toString();
		return `obsidian://task-genius/settings${queryString ? "?" + queryString : ""}`;
	}

	/**
	 * Generate URI for creating a task
	 * Uses the cleaner path format: obsidian://task-genius/create-task?content=...
	 */
	static generateCreateTaskUri(
		content: string,
		options?: {
			project?: string;
			context?: string;
			tags?: string[];
			priority?: number;
			dueDate?: string;
			startDate?: string;
		},
	): string {
		const params = new URLSearchParams();
		params.set("content", encodeURIComponent(content));

		if (options?.project)
			params.set("project", encodeURIComponent(options.project));
		if (options?.context)
			params.set("context", encodeURIComponent(options.context));
		if (options?.tags) params.set("tags", options.tags.join(","));
		if (options?.priority)
			params.set("priority", options.priority.toString());
		if (options?.dueDate) params.set("dueDate", options.dueDate);
		if (options?.startDate) params.set("startDate", options.startDate);

		return `obsidian://task-genius/create-task?${params.toString()}`;
	}

	/**
	 * Generate URI for opening a view
	 * Uses the cleaner path format: obsidian://task-genius/open-view?type=...
	 */
	static generateOpenViewUri(viewType: string): string {
		return `obsidian://task-genius/open-view?type=${viewType}`;
	}
}
