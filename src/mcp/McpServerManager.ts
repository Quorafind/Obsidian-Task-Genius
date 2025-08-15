/**
 * McpServerManager - Manages the lifecycle of the MCP server
 */

import { Notice, Platform } from "obsidian";
import { McpServer } from "./McpServer";
import { McpServerConfig, McpServerStatus } from "./types/mcp";
import TaskProgressBarPlugin from "../index";
import { AuthMiddleware } from "./auth/AuthMiddleware";

export class McpServerManager {
	private server?: McpServer;
	private config: McpServerConfig;
	private autoRestartAttempts: number = 0;
	private maxAutoRestartAttempts: number = 3;

	// Check if a port is available on the given host
	private isPortAvailable(port: number, host: string): Promise<boolean> {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const net = require("net");
		return new Promise((resolve) => {
			const tester = net
				.createServer()
				.once("error", (err: any) => {
					if (err && (err.code === "EADDRINUSE" || err.code === "EACCES")) {
						resolve(false);
					} else {
						resolve(false);
					}
				})
				.once("listening", () => {
					tester.close(() => resolve(true));
				})
				.listen(port, host);
		});
	}

	constructor(private plugin: TaskProgressBarPlugin) {
		// Load config from settings or use defaults
		this.config = this.getDefaultConfig();
		this.loadConfig();
	}

	private getDefaultConfig(): McpServerConfig {
		return {
			enabled: false,
			port: 7777,
			host: "127.0.0.1",
			authToken: AuthMiddleware.generateToken(),
			enableCors: true,
			logLevel: "info",
		};
	}

	private loadConfig(): void {
		const settings = this.plugin.settings;
		if (settings.mcpIntegration) {
			this.config = {
				...this.config,
				...settings.mcpIntegration,
			};
		}
	}

	async saveConfig(): Promise<void> {
		this.plugin.settings.mcpIntegration = this.config;
		await this.plugin.saveSettings();
	}

	async initialize(): Promise<void> {
		// Only initialize on desktop
		if (!Platform.isDesktopApp) {
			console.log("MCP Server is only available on desktop");
			return;
		}

		if (this.config.enabled) {
			await this.start();
		}
	}

	async start(): Promise<void> {
		if (this.server) {
			await this.stop();
		}

		// Proactively check for port availability to better handle multi-vault scenarios
		const available = await this.isPortAvailable(this.config.port, this.config.host);
		if (!available) {
			new Notice(
				`Port ${this.config.port} on ${this.config.host} is already in use. Please choose another port in MCP settings.`
			);
			console.warn(
				`MCP Server port conflict detected on ${this.config.host}:${this.config.port}`
			);
			return;
		}

		try {
			this.server = new McpServer(this.plugin, this.config);
			await this.server.start();
			this.autoRestartAttempts = 0;
			const status = this.server.getStatus();
			new Notice(
				`MCP Server started on ${this.config.host}:${status.port}`
			);
		} catch (error: any) {
			console.error("Failed to start MCP Server:", error);
			if (error?.code === "EADDRINUSE" || /EADDRINUSE/.test(error?.message || "")) {
				new Notice(
					`Port ${this.config.port} on ${this.config.host} is already in use. Please change the port in settings.`
				);
				return;
			}
			new Notice(`Failed to start MCP Server: ${error.message}`);

			// Auto-restart logic for transient errors only
			if (this.autoRestartAttempts < this.maxAutoRestartAttempts) {
				this.autoRestartAttempts++;
				console.log(
					`Attempting auto-restart (${this.autoRestartAttempts}/${this.maxAutoRestartAttempts})`
				);
				setTimeout(() => this.start(), 5000);
			}
		}
	}

	async stop(): Promise<void> {
		if (!this.server) {
			return;
		}

		try {
			await this.server.stop();
			this.server = undefined;
			new Notice("MCP Server stopped");
		} catch (error: any) {
			console.error("Failed to stop MCP Server:", error);
			new Notice(`Failed to stop MCP Server: ${error.message}`);
		}
	}

	async restart(): Promise<void> {
		await this.stop();
		await this.start();
	}

	async toggle(): Promise<void> {
		if (this.isRunning()) {
			await this.stop();
			this.config.enabled = false;
		} else {
			this.config.enabled = true;
			await this.start();
		}
		await this.saveConfig();
	}

	isRunning(): boolean {
		return this.server?.getStatus().running || false;
	}

	getStatus(): McpServerStatus {
		if (!this.server) {
			return {
				running: false,
			};
		}

		const status = this.server.getStatus();
		return {
			running: status.running,
			port: status.port,
			startTime: status.startTime,
			requestCount: status.requestCount,
		};
	}

	getConfig(): McpServerConfig {
		return { ...this.config };
	}

	async updateConfig(updates: Partial<McpServerConfig>): Promise<void> {
		const wasRunning = this.isRunning();
		const desiredPort = updates.port ?? this.config.port;
		const desiredHost = updates.host ?? this.config.host;
		const portChanged = updates.port !== undefined && updates.port !== this.config.port;
		const hostChanged = updates.host !== undefined && updates.host !== this.config.host;

		// If network settings are changing, validate availability first
		if (portChanged || hostChanged) {
			const available = await this.isPortAvailable(desiredPort, desiredHost);
			if (!available) {
				new Notice(
					`Port ${desiredHost}:${desiredPort} is already in use. Please choose another port.`
				);
				throw new Error("Port in use");
			}
		}

		// Update config (after validation)
		this.config = {
			...this.config,
			...updates,
		};

		// Save to settings
		await this.saveConfig();

		// Update running server config
		if (this.server) {
			this.server.updateConfig(updates);

			// Restart if network settings changed
			if (wasRunning && (portChanged || hostChanged)) {
				await this.restart();
			}
		}

		// Start/stop based on enabled state
		if (updates.enabled !== undefined) {
			if (updates.enabled && !wasRunning) {
				await this.start();
			} else if (!updates.enabled && wasRunning) {
				await this.stop();
			}
		}
	}

	getAuthToken(): string {
		return this.config.authToken;
	}

	regenerateAuthToken(): string {
		const newToken = AuthMiddleware.generateToken();
		this.config.authToken = newToken;
		
		if (this.server) {
			this.server.updateConfig({ authToken: newToken });
		}

		this.saveConfig();
		return newToken;
	}

	async cleanup(): Promise<void> {
		await this.stop();
	}
}