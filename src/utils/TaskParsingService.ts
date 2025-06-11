/**
 * Task Parsing Service
 *
 * Integrates ProjectConfigManager with MarkdownTaskParser to provide
 * enhanced task parsing with project configuration support
 */

import { Vault, MetadataCache } from "obsidian";
import { MarkdownTaskParser } from "./workers/ConfigurableTaskParser";
import {
	ProjectConfigManager,
	ProjectConfigManagerOptions,
} from "./ProjectConfigManager";
import { TaskParserConfig, EnhancedTask } from "../types/TaskParserConfig";
import { Task, TgProject } from "../types/task";

export interface TaskParsingServiceOptions {
	vault: Vault;
	metadataCache: MetadataCache;
	parserConfig: TaskParserConfig;
	projectConfigOptions?: {
		configFileName: string;
		searchRecursively: boolean;
		metadataKey: string;
		pathMappings: Array<{
			pathPattern: string;
			projectName: string;
			enabled: boolean;
		}>;
	};
}

export class TaskParsingService {
	private parser: MarkdownTaskParser;
	private projectConfigManager?: ProjectConfigManager;
	private vault: Vault;
	private metadataCache: MetadataCache;

	constructor(options: TaskParsingServiceOptions) {
		this.vault = options.vault;
		this.metadataCache = options.metadataCache;
		this.parser = new MarkdownTaskParser(options.parserConfig);

		// Initialize project config manager if enhanced project is enabled
		if (
			options.parserConfig.projectConfig?.enableEnhancedProject &&
			options.projectConfigOptions
		) {
			this.projectConfigManager = new ProjectConfigManager({
				vault: options.vault,
				metadataCache: options.metadataCache,
				...options.projectConfigOptions,
			});
		}
	}

	/**
	 * Parse tasks from content with enhanced project support
	 */
	async parseTasksFromContent(
		content: string,
		filePath: string
	): Promise<EnhancedTask[]> {
		let fileMetadata: Record<string, any> | undefined;
		let projectConfigData: Record<string, any> | undefined;
		let tgProject: TgProject | undefined;

		// Get enhanced metadata if project config manager is available
		if (this.projectConfigManager) {
			try {
				// Get file metadata (frontmatter)
				fileMetadata =
					this.projectConfigManager.getFileMetadata(filePath) ||
					undefined;

				// Get project configuration data
				projectConfigData =
					(await this.projectConfigManager.getProjectConfig(
						filePath
					)) || undefined;

				// Determine tgProject
				tgProject = await this.projectConfigManager.determineTgProject(
					filePath
				);
			} catch (error) {
				console.warn(
					`Failed to get enhanced metadata for ${filePath}:`,
					error
				);
			}
		}

		// Parse tasks with enhanced data
		return this.parser.parse(
			content,
			filePath,
			fileMetadata,
			projectConfigData,
			tgProject
		);
	}

	/**
	 * Parse tasks and return legacy Task format for compatibility
	 */
	async parseTasksFromContentLegacy(
		content: string,
		filePath: string
	): Promise<Task[]> {
		let fileMetadata: Record<string, any> | undefined;
		let projectConfigData: Record<string, any> | undefined;
		let tgProject: TgProject | undefined;

		// Get enhanced metadata if project config manager is available
		if (this.projectConfigManager) {
			try {
				fileMetadata =
					this.projectConfigManager.getFileMetadata(filePath) ||
					undefined;
				projectConfigData =
					(await this.projectConfigManager.getProjectConfig(
						filePath
					)) || undefined;
				tgProject = await this.projectConfigManager.determineTgProject(
					filePath
				);
			} catch (error) {
				console.warn(
					`Failed to get enhanced metadata for ${filePath}:`,
					error
				);
			}
		}

		// Parse tasks with enhanced data
		return this.parser.parseLegacy(
			content,
			filePath,
			fileMetadata,
			projectConfigData,
			tgProject
		);
	}

	/**
	 * Parse a single task line
	 */
	async parseTaskLine(
		line: string,
		filePath: string,
		lineNumber: number
	): Promise<Task | null> {
		const tasks = await this.parseTasksFromContentLegacy(line, filePath);

		if (tasks.length > 0) {
			const task = tasks[0];
			// Override line number to match the expected behavior
			task.line = lineNumber;
			return task;
		}

		return null;
	}

	/**
	 * Get enhanced metadata for a file
	 */
	async getEnhancedMetadata(filePath: string): Promise<Record<string, any>> {
		if (!this.projectConfigManager) {
			return {};
		}

		try {
			return await this.projectConfigManager.getEnhancedMetadata(
				filePath
			);
		} catch (error) {
			console.warn(
				`Failed to get enhanced metadata for ${filePath}:`,
				error
			);
			return {};
		}
	}

	/**
	 * Get tgProject for a file
	 */
	async getTgProject(filePath: string): Promise<TgProject | undefined> {
		if (!this.projectConfigManager) {
			return undefined;
		}

		try {
			return await this.projectConfigManager.determineTgProject(filePath);
		} catch (error) {
			console.warn(
				`Failed to determine tgProject for ${filePath}:`,
				error
			);
			return undefined;
		}
	}

	/**
	 * Clear project configuration cache
	 */
	clearProjectConfigCache(filePath?: string): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.clearCache(filePath);
		}
	}

	/**
	 * Update parser configuration
	 */
	updateParserConfig(config: TaskParserConfig): void {
		this.parser = new MarkdownTaskParser(config);
	}

	/**
	 * Update project configuration options
	 */
	updateProjectConfigOptions(
		options: Partial<ProjectConfigManagerOptions>
	): void {
		if (this.projectConfigManager) {
			this.projectConfigManager.updateOptions(options);
		}
	}

	/**
	 * Enable or disable enhanced project support
	 */
	setEnhancedProjectEnabled(
		enabled: boolean,
		projectConfigOptions?: {
			configFileName: string;
			searchRecursively: boolean;
			metadataKey: string;
			pathMappings: Array<{
				pathPattern: string;
				projectName: string;
				enabled: boolean;
			}>;
		}
	): void {
		if (enabled && projectConfigOptions) {
			// Create or update project config manager
			if (!this.projectConfigManager) {
				this.projectConfigManager = new ProjectConfigManager({
					vault: this.vault,
					metadataCache: this.metadataCache,
					...projectConfigOptions,
				});
			} else {
				this.projectConfigManager.updateOptions(projectConfigOptions);
			}
		} else if (!enabled) {
			// Disable project config manager
			this.projectConfigManager = undefined;
		}
	}

	/**
	 * Check if enhanced project support is enabled
	 */
	isEnhancedProjectEnabled(): boolean {
		return !!this.projectConfigManager;
	}
}
