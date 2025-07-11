/**
 * View Manager
 * 负责管理和注册自定义视图
 */

import { App, Component } from "obsidian";
import { FileTaskView } from "./FileTaskView";
import { InboxBasesView } from "./InboxBasesView";
import { FlaggedBasesView } from "./FlaggedBasesView";
import { ProjectBasesView } from "./ProjectBasesView";
import { TagsBasesView } from "./TagsBasesView";
import TaskProgressBarPlugin from "../index";
import "../styles/base-view.css";
import { requireApiVersion } from "obsidian";
import { BasesPlugin, BasesViewRegistration, BaseView } from "../types/bases";

export class ViewManager extends Component {
	private app: App;
	private basesPlugin: BasesPlugin | null = null;
	private registeredViews: Set<string> = new Set();
	private plugin: TaskProgressBarPlugin;

	constructor(app: App, plugin: TaskProgressBarPlugin) {
		super();
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 获取 Bases 插件实例
	 */
	private getBasesPlugin(): BasesPlugin | null {
		try {
			// 使用你提供的方法获取插件
			const internalPlugins = (this.app as any).internalPlugins?.plugins;
			if (internalPlugins && internalPlugins["bases"]) {
				this.basesPlugin = internalPlugins["bases"].instance;
				console.log(
					"[ViewManager] Bases plugin found via internalPlugins"
				);
				return this.basesPlugin;
			}

			console.warn("[ViewManager] Bases plugin not found");
			return null;
		} catch (error) {
			console.error("[ViewManager] Error getting Bases plugin:", error);
			return null;
		}
	}

	/**
	 * Check if the new Bases API (registerBasesView) is supported
	 */
	private isNewBasesApiSupported(): boolean {
		try {
			// Check if plugin has the new method
			const hasPluginMethod =
				typeof (this.plugin as any).registerBasesView === "function";

			// Check version via VersionManager if available
			const versionManager = this.plugin.versionManager;
			const hasVersionSupport = versionManager
				? versionManager.isNewBasesApiSupported()
				: false;

			console.log(
				`[ViewManager] New Bases API support - Plugin method: ${hasPluginMethod}, Version support: ${hasVersionSupport}`
			);

			return hasPluginMethod || hasVersionSupport;
		} catch (error) {
			console.error(
				"[ViewManager] Error checking new Bases API support:",
				error
			);
			return false;
		}
	}

	/**
	 * 初始化视图管理器
	 */
	async initialize(): Promise<boolean> {
		console.log("[ViewManager] Initializing...");

		const basesPlugin = this.getBasesPlugin();
		console.log(basesPlugin);
		if (!basesPlugin) {
			console.error(
				"[ViewManager] Cannot initialize without Bases plugin"
			);
			return false;
		}

		try {
			// 注册所有自定义视图
			await this.registerAllViews();
			console.log("[ViewManager] Initialization completed successfully");
			return true;
		} catch (error) {
			console.error("[ViewManager] Initialization failed:", error);
			return false;
		}
	}

	/**
	 * 注册所有自定义视图
	 */
	private async registerAllViews(): Promise<void> {
		// 注册文件任务视图
		await this.registerFileTaskView();

		// 注册专门的视图
		await this.registerInboxView();
		await this.registerFlaggedView();
		await this.registerProjectsView();
		await this.registerTagsView();

		// 在这里可以注册更多视图
		// await this.registerTimelineView();
		// await this.registerKanbanView();
	}

	/**
	 * 注册文件任务视图
	 */
	private async registerFileTaskView(): Promise<void> {
		const viewId = "task-genius-view";

		if (this.registeredViews.has(viewId)) {
			console.log(`[ViewManager] View ${viewId} already registered`);
			return;
		}

		try {
			const factory = (container: HTMLElement) => {
				console.log(`[ViewManager] Creating ${viewId} instance`);
				return new FileTaskView(container, this.app, this.plugin);
			};

			await this.registerView(
				viewId,
				factory,
				"Task Genius View",
				"task-genius"
			);
		} catch (error) {
			console.error(
				`[ViewManager] Failed to register view ${viewId}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * 注册收件箱视图
	 */
	private async registerInboxView(): Promise<void> {
		const viewId = "inbox-bases-view";

		if (this.registeredViews.has(viewId)) {
			console.log(`[ViewManager] View ${viewId} already registered`);
			return;
		}

		try {
			const factory = (container: HTMLElement) => {
				console.log(`[ViewManager] Creating ${viewId} instance`);
				return new InboxBasesView(container, this.app, this.plugin);
			};

			await this.registerView(viewId, factory, "Inbox Tasks", "inbox");
		} catch (error) {
			console.error(
				`[ViewManager] Failed to register view ${viewId}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * 注册标记任务视图
	 */
	private async registerFlaggedView(): Promise<void> {
		const viewId = "flagged-bases-view";

		if (this.registeredViews.has(viewId)) {
			console.log(`[ViewManager] View ${viewId} already registered`);
			return;
		}

		try {
			const factory = (container: HTMLElement) => {
				console.log(`[ViewManager] Creating ${viewId} instance`);
				return new FlaggedBasesView(container, this.app, this.plugin);
			};

			await this.registerView(viewId, factory, "Flagged Tasks", "flag");
		} catch (error) {
			console.error(
				`[ViewManager] Failed to register view ${viewId}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * 注册项目视图
	 */
	private async registerProjectsView(): Promise<void> {
		const viewId = "projects-bases-view";

		if (this.registeredViews.has(viewId)) {
			console.log(`[ViewManager] View ${viewId} already registered`);
			return;
		}

		try {
			const factory = (container: HTMLElement) => {
				console.log(`[ViewManager] Creating ${viewId} instance`);
				return new ProjectBasesView(container, this.app, this.plugin);
			};

			await this.registerView(
				viewId,
				factory,
				"Project Tasks",
				"folders"
			);
		} catch (error) {
			console.error(
				`[ViewManager] Failed to register view ${viewId}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * 注册标签视图
	 */
	private async registerTagsView(): Promise<void> {
		const viewId = "tags-bases-view";

		if (this.registeredViews.has(viewId)) {
			console.log(`[ViewManager] View ${viewId} already registered`);
			return;
		}

		try {
			const factory = (container: HTMLElement) => {
				console.log(`[ViewManager] Creating ${viewId} instance`);
				return new TagsBasesView(container, this.app, this.plugin);
			};

			await this.registerView(viewId, factory, "Tagged Tasks", "tag");
		} catch (error) {
			console.error(
				`[ViewManager] Failed to register view ${viewId}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * 通用视图注册方法
	 */
	private async registerView(
		viewId: string,
		factory: (container: HTMLElement) => any,
		name: string,
		icon: string
	): Promise<void> {
		// Check if new API is supported
		if (this.isNewBasesApiSupported()) {
			console.log(
				`[ViewManager] Using legacy registerView API for ${viewId}`
			);

			// Use legacy bases plugin registration method
			if (!this.basesPlugin) {
				throw new Error(
					"Bases plugin not available for legacy registration"
				);
			}

			// Create view registration configuration
			const viewConfig: BasesViewRegistration = {
				name: name,
				icon: icon,
				factory: factory,
			};

			// Try to register with config first, fallback to factory only
			// Register view is handled by plugin itself(Will help remove the need to register view in bases plugin)
			try {
				this.plugin.registerBasesView(viewId, viewConfig);
			} catch (configError) {
				console.warn(
					`[ViewManager] Config registration failed, trying factory-only registration:`,
					configError
				);
				this.basesPlugin.registerView(viewId, factory);
			}

			this.registeredViews.add(viewId);
			console.log(
				`[ViewManager] Successfully registered view using legacy API: ${viewId}`
			);
		} else if (requireApiVersion("1.9.0")) {
			console.log(
				`[ViewManager] Using new registerBasesView API for ${viewId}`
			);

			// Use new plugin-level registration method
			// Method is used between 1.9.0 and 1.9.3
			const success = (this.plugin as any).registerBasesView(
				viewId,
				factory
			);

			if (success) {
				this.registeredViews.add(viewId);
				console.log(
					`[ViewManager] Successfully registered view using new API: ${viewId}`
				);
			} else {
				throw new Error("New API registration returned false");
			}
		}
	}

	/**
	 * 注销视图
	 */
	unregisterView(viewId: string): void {
		try {
			if (!this.registeredViews.has(viewId)) {
				console.log(
					`[ViewManager] View ${viewId} not registered, skipping unregistration`
				);
				return;
			}

			// For new API, the cleanup is handled automatically by the plugin
			if (this.isNewBasesApiSupported()) {
				console.log(
					`[ViewManager] View ${viewId} registered with new API, cleanup handled automatically`
				);
			} else {
				// For legacy API, manually unregister from bases plugin
				if (this.basesPlugin) {
					this.basesPlugin.deregisterView(viewId);
					console.log(
						`[ViewManager] Manually unregistered view from bases plugin: ${viewId}`
					);
				}
			}

			this.registeredViews.delete(viewId);
			console.log(`[ViewManager] Unregistered view: ${viewId}`);
		} catch (error) {
			console.error(
				`[ViewManager] Failed to unregister view ${viewId}:`,
				error
			);
		}
	}

	/**
	 * 注销所有视图
	 */
	unregisterAllViews(): void {
		console.log("[ViewManager] Unregistering all views...");

		// Create a copy of the set to avoid modification during iteration
		const viewsToUnregister = Array.from(this.registeredViews);

		for (const viewId of viewsToUnregister) {
			this.unregisterView(viewId);
		}

		console.log("[ViewManager] All views unregistered");
	}

	/**
	 * 获取已注册的视图列表
	 */
	getRegisteredViews(): string[] {
		return Array.from(this.registeredViews);
	}

	/**
	 * 检查视图是否已注册
	 */
	isViewRegistered(viewId: string): boolean {
		return this.registeredViews.has(viewId);
	}

	/**
	 * 获取 Bases 插件的可用视图类型
	 */
	getAvailableViewTypes(): string[] {
		if (!this.basesPlugin) {
			return [];
		}

		try {
			return this.basesPlugin.getViewTypes();
		} catch (error) {
			console.error("[ViewManager] Error getting view types:", error);
			return [];
		}
	}

	/**
	 * 创建视图实例（用于测试）
	 */
	createViewInstance(
		viewId: string,
		container: HTMLElement
	): BaseView | null {
		if (!this.basesPlugin) {
			console.error("[ViewManager] Bases plugin not available");
			return null;
		}

		try {
			const factory = this.basesPlugin.getViewFactory(viewId);
			if (factory) {
				return factory(container);
			} else {
				console.error(
					`[ViewManager] No factory found for view: ${viewId}`
				);
				return null;
			}
		} catch (error) {
			console.error(
				`[ViewManager] Error creating view instance ${viewId}:`,
				error
			);
			return null;
		}
	}

	/**
	 * 获取插件状态信息
	 */
	getStatus(): {
		basesPluginAvailable: boolean;
		registeredViewsCount: number;
		registeredViews: string[];
		availableViewTypes: string[];
		usingNewApi: boolean;
		apiVersion: string;
	} {
		const usingNewApi = this.isNewBasesApiSupported();

		return {
			basesPluginAvailable: !!this.basesPlugin,
			registeredViewsCount: this.registeredViews.size,
			registeredViews: this.getRegisteredViews(),
			availableViewTypes: this.getAvailableViewTypes(),
			usingNewApi: usingNewApi,
			apiVersion: usingNewApi ? "1.9.3+" : "legacy",
		};
	}

	onload(): void {
		this.initialize();
	}

	/**
	 * Component unload handler
	 */
	onunload(): void {
		console.log("[ViewManager] Unloading...");
		this.unregisterAllViews();
		super.onunload();
	}
}
