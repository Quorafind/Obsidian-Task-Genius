/**
 * Cloud Calendar Manager
 * Central manager for cloud calendar integration
 * Handles authentication, synchronization, and data management
 */

import { Component, Notice } from "obsidian";
import TaskProgressBarPlugin from "../../index";
import { OAuth2Manager } from "../auth/OAuth2Manager";
import { BrowserAuthFlow } from "../auth/BrowserAuthFlow";
import { ObsidianURIHandler } from "../auth/ObsidianURIHandler";
import { GoogleOAuth2Provider } from "../auth/GoogleOAuth2Provider";
import { iCloudOAuth2Provider } from "../auth/iCloudOAuth2Provider";
import { OAuth2Provider } from "../auth/OAuth2Provider";
import { CloudCalendarAdapter } from "./CloudCalendarAdapter";
import { GoogleCalendarAdapter } from "./GoogleCalendarAdapter";
import { iCloudCalendarAdapter } from "./iCloudCalendarAdapter";
import {
	CloudCalendarConfig,
	CloudSyncResult,
	CloudSyncStatus,
	OAuth2Tokens,
} from "../../types/cloud-calendar";
import { IcsEvent } from "../../types/ics";

export class CloudCalendarManager extends Component {
	private plugin: TaskProgressBarPlugin;
	private oauth2Manager: OAuth2Manager;
	private browserAuthFlow: BrowserAuthFlow;
	private uriHandler: ObsidianURIHandler;

	private adapters: Map<string, CloudCalendarAdapter> = new Map();
	private configurations: Map<string, CloudCalendarConfig> = new Map();
	private syncStatuses: Map<string, CloudSyncStatus> = new Map();
	private syncIntervals: Map<string, number> = new Map();

	constructor(plugin: TaskProgressBarPlugin) {
		super();
		this.plugin = plugin;

		// Initialize authentication components
		this.oauth2Manager = new OAuth2Manager(plugin);
		this.uriHandler = new ObsidianURIHandler(plugin, this.oauth2Manager);
		this.browserAuthFlow = new BrowserAuthFlow(
			plugin,
			this.oauth2Manager,
			this.uriHandler
		);
	}

	/**
	 * Initialize cloud calendar manager
	 */
	async initialize(): Promise<void> {
		try {
			// Add child components
			this.addChild(this.oauth2Manager);
			this.addChild(this.browserAuthFlow);

			// Register OAuth providers
			this.oauth2Manager.registerProvider(
				"google",
				new GoogleOAuth2Provider()
			);
			this.oauth2Manager.registerProvider(
				"icloud",
				new iCloudOAuth2Provider()
			);

			// Register cloud adapters
			this.adapters.set("google", new GoogleCalendarAdapter());
			this.adapters.set("icloud", new iCloudCalendarAdapter());

			// Initialize URI handler
			this.uriHandler.initialize();

			// Load existing configurations
			await this.loadConfigurations();

			console.log("CloudCalendarManager: Initialized successfully");
		} catch (error) {
			console.error(
				"CloudCalendarManager: Initialization failed:",
				error
			);
			throw error;
		}
	}

	/**
	 * Add a new cloud calendar configuration
	 */
	async addCloudCalendar(
		provider: "google" | "icloud",
		name: string,
		authConfig: any
	): Promise<CloudCalendarConfig> {
		try {
			// Generate unique ID
			const id = this.generateConfigId();

			// Create configuration
			const config: CloudCalendarConfig = {
				id,
				provider,
				name,
				enabled: true,
				auth: authConfig,
				calendars: [],
				syncSettings: {
					refreshInterval: 60, // 1 hour
					syncPastDays: 30,
					syncFutureDays: 365,
					showAllDayEvents: true,
					showTimedEvents: true,
					maxEventsPerCalendar: 1000,
					syncDeletedEvents: false,
				},
				createdAt: Date.now(),
			};

			// Test connection
			const adapter = this.adapters.get(provider);
			if (!adapter) {
				throw new Error(`Adapter for ${provider} not found`);
			}

			const isConnected = await adapter.testConnection(
				authConfig.accessToken
			);
			if (!isConnected) {
				throw new Error(`Failed to connect to ${provider}`);
			}

			// Fetch available calendars
			const calendarList = await adapter.getCalendarList(
				authConfig.accessToken
			);
			config.calendars = calendarList.calendars.map((cal) => ({
				...cal,
				enabled: cal.isPrimary || false, // Enable primary calendar by default
			}));

			// Store configuration
			this.configurations.set(id, config);
			await this.saveConfigurations();

			// Initialize sync status
			this.syncStatuses.set(id, {
				configId: id,
				provider,
				status: "idle",
				lastSync: undefined,
				nextSync: undefined,
			});

			// Start automatic sync if enabled
			if (config.enabled) {
				this.scheduleSync(id);
			}

			new Notice(`${provider} calendar connected successfully!`);
			return config;
		} catch (error) {
			console.error(
				`CloudCalendarManager: Failed to add ${provider} calendar:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Authenticate with Google Calendar
	 */
	async authenticateGoogle(
		clientId: string,
		clientSecret?: string
	): Promise<CloudCalendarConfig> {
		try {
			const config = {
				clientId,
				clientSecret,
				scopes: [
					"https://www.googleapis.com/auth/calendar.readonly",
					"https://www.googleapis.com/auth/userinfo.email",
				],
				redirectUri: this.uriHandler.getOAuthRedirectUri(),
			};

			// Start OAuth flow
			const tokens = await this.browserAuthFlow.startOAuthFlow(
				"google",
				config
			);

			// Create auth configuration
			const authConfig = {
				...config,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				tokenExpiry: Date.now() + tokens.expiresIn * 1000,
			};

			// Add calendar configuration
			return await this.addCloudCalendar(
				"google",
				"Google Calendar",
				authConfig
			);
		} catch (error) {
			console.error(
				"CloudCalendarManager: Google authentication failed:",
				error
			);
			throw error;
		}
	}

	/**
	 * Authenticate with iCloud Calendar
	 */
	async authenticateiCloud(
		username: string,
		appPassword: string
	): Promise<CloudCalendarConfig> {
		try {
			// Start iCloud flow
			const tokens = await this.browserAuthFlow.startiCloudFlow(
				username,
				appPassword
			);

			// Create auth configuration
			const authConfig = {
				clientId: "", // Not used for iCloud
				scopes: ["calendar"],
				redirectUri: this.uriHandler.getiCloudAuthUri(),
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				tokenExpiry: Date.now() + tokens.expiresIn * 1000,
			};

			// Add calendar configuration
			return await this.addCloudCalendar(
				"icloud",
				"iCloud Calendar",
				authConfig
			);
		} catch (error) {
			console.error(
				"CloudCalendarManager: iCloud authentication failed:",
				error
			);
			throw error;
		}
	}

	/**
	 * Sync events from a specific configuration
	 */
	async syncConfiguration(configId: string): Promise<CloudSyncResult> {
		const config = this.configurations.get(configId);
		if (!config) {
			throw new Error(`Configuration ${configId} not found`);
		}

		const adapter = this.adapters.get(config.provider);
		if (!adapter) {
			throw new Error(`Adapter for ${config.provider} not found`);
		}

		const startTime = Date.now();

		// Update sync status
		this.updateSyncStatus(configId, {
			status: "syncing",
			nextSync: undefined,
		});

		try {
			// Check token validity and refresh if needed
			await this.ensureValidToken(config);

			const allEvents: IcsEvent[] = [];
			const enabledCalendars = config.calendars.filter(
				(cal) => cal.enabled
			);

			// Sync each enabled calendar
			for (const calendar of enabledCalendars) {
				const events = await this.syncCalendar(
					config,
					calendar.id,
					adapter
				);
				allEvents.push(...events);
			}

			const syncResult: CloudSyncResult = {
				success: true,
				events: allEvents,
				calendars: enabledCalendars,
				timestamp: Date.now(),
				duration: Date.now() - startTime,
				newEvents: allEvents.length, // Simplified - in real implementation, track new vs updated
				updatedEvents: 0,
				deletedEvents: 0,
			};

			// Update sync status
			this.updateSyncStatus(configId, {
				status: "idle",
				lastSync: syncResult.timestamp,
				eventCount: allEvents.length,
				calendarsCount: enabledCalendars.length,
				syncDuration: syncResult.duration,
			});

			// Schedule next sync
			this.scheduleSync(configId);

			console.log(
				`CloudCalendarManager: Synced ${allEvents.length} events from ${config.name}`
			);
			return syncResult;
		} catch (error) {
			console.error(
				`CloudCalendarManager: Sync failed for ${config.name}:`,
				error
			);

			// Update sync status with error
			this.updateSyncStatus(configId, {
				status: "error",
				error: error instanceof Error ? error.message : "Unknown error",
			});

			throw error;
		}
	}

	/**
	 * Sync all enabled configurations
	 */
	async syncAll(): Promise<CloudSyncResult[]> {
		const results: CloudSyncResult[] = [];
		const enabledConfigs = Array.from(this.configurations.values()).filter(
			(config) => config.enabled
		);

		for (const config of enabledConfigs) {
			try {
				const result = await this.syncConfiguration(config.id);
				results.push(result);
			} catch (error) {
				console.error(
					`CloudCalendarManager: Failed to sync ${config.name}:`,
					error
				);
				// Continue with other configurations
			}
		}

		return results;
	}

	/**
	 * Get all cloud calendar configurations
	 */
	getConfigurations(): CloudCalendarConfig[] {
		return Array.from(this.configurations.values());
	}

	/**
	 * Get OAuth2 provider by name
	 */
	getOAuth2Provider(providerName: string): OAuth2Provider | undefined {
		return this.oauth2Manager.getProvider(providerName);
	}

	/**
	 * Get configuration by ID
	 */
	getConfiguration(id: string): CloudCalendarConfig | undefined {
		return this.configurations.get(id);
	}

	/**
	 * Update configuration
	 */
	async updateConfiguration(
		id: string,
		updates: Partial<CloudCalendarConfig>
	): Promise<void> {
		const config = this.configurations.get(id);
		if (!config) {
			throw new Error(`Configuration ${id} not found`);
		}

		// Apply updates
		Object.assign(config, updates);

		// Save changes
		await this.saveConfigurations();

		// Reschedule sync if settings changed
		if (updates.enabled !== undefined || updates.syncSettings) {
			this.cancelSync(id);
			if (config.enabled) {
				this.scheduleSync(id);
			}
		}
	}

	/**
	 * Remove configuration
	 */
	async removeConfiguration(id: string): Promise<void> {
		const config = this.configurations.get(id);
		if (!config) {
			return;
		}

		// Cancel sync
		this.cancelSync(id);

		// Remove from maps
		this.configurations.delete(id);
		this.syncStatuses.delete(id);

		// Save changes
		await this.saveConfigurations();

		new Notice(`${config.name} removed successfully`);
	}

	/**
	 * Get sync status for all configurations
	 */
	getSyncStatuses(): CloudSyncStatus[] {
		return Array.from(this.syncStatuses.values());
	}

	/**
	 * Get sync status for specific configuration
	 */
	getSyncStatus(configId: string): CloudSyncStatus | undefined {
		return this.syncStatuses.get(configId);
	}

	/**
	 * Sync events from a specific calendar
	 */
	private async syncCalendar(
		config: CloudCalendarConfig,
		calendarId: string,
		adapter: CloudCalendarAdapter
	): Promise<IcsEvent[]> {
		const now = new Date();
		const startDate = new Date(
			now.getTime() -
				config.syncSettings.syncPastDays * 24 * 60 * 60 * 1000
		);
		const endDate = new Date(
			now.getTime() +
				config.syncSettings.syncFutureDays * 24 * 60 * 60 * 1000
		);

		const options = {
			startDate,
			endDate,
			maxResults: config.syncSettings.maxEventsPerCalendar,
			singleEvents: true,
			showDeleted: config.syncSettings.syncDeletedEvents,
		};

		const result = await adapter.getEvents(
			config.auth.accessToken!,
			calendarId,
			options
		);

		// Filter events based on settings
		return result.events.filter((event) => {
			if (event.allDay && !config.syncSettings.showAllDayEvents) {
				return false;
			}
			if (!event.allDay && !config.syncSettings.showTimedEvents) {
				return false;
			}
			return true;
		});
	}

	/**
	 * Ensure token is valid and refresh if needed
	 */
	private async ensureValidToken(config: CloudCalendarConfig): Promise<void> {
		if (!config.auth.tokenExpiry || !config.auth.refreshToken) {
			return; // No token management needed
		}

		// Check if token is expired or about to expire (5 minute buffer)
		const isExpired = this.oauth2Manager.isTokenExpired(
			config.auth.tokenExpiry,
			5
		);

		if (isExpired) {
			try {
				const tokens = await this.oauth2Manager.refreshToken(
					config.provider,
					config.auth.refreshToken,
					config.auth
				);

				// Update configuration with new tokens
				config.auth.accessToken = tokens.accessToken;
				config.auth.refreshToken =
					tokens.refreshToken || config.auth.refreshToken;
				config.auth.tokenExpiry = Date.now() + tokens.expiresIn * 1000;

				await this.saveConfigurations();
				console.log(
					`CloudCalendarManager: Refreshed token for ${config.name}`
				);
			} catch (error) {
				console.error(
					`CloudCalendarManager: Token refresh failed for ${config.name}:`,
					error
				);
				throw new Error(
					`Authentication expired for ${config.name}. Please re-authenticate.`
				);
			}
		}
	}

	/**
	 * Schedule automatic sync for a configuration
	 */
	private scheduleSync(configId: string): void {
		const config = this.configurations.get(configId);
		if (!config || !config.enabled) {
			return;
		}

		// Cancel existing interval
		this.cancelSync(configId);

		// Schedule new interval
		const intervalMs = config.syncSettings.refreshInterval * 60 * 1000; // Convert minutes to ms
		const intervalId = window.setInterval(async () => {
			try {
				await this.syncConfiguration(configId);
			} catch (error) {
				console.error(
					`CloudCalendarManager: Scheduled sync failed for ${config.name}:`,
					error
				);
			}
		}, intervalMs);

		this.syncIntervals.set(configId, intervalId);

		// Update next sync time
		this.updateSyncStatus(configId, {
			nextSync: Date.now() + intervalMs,
		});
	}

	/**
	 * Cancel scheduled sync for a configuration
	 */
	private cancelSync(configId: string): void {
		const intervalId = this.syncIntervals.get(configId);
		if (intervalId) {
			window.clearInterval(intervalId);
			this.syncIntervals.delete(configId);
		}
	}

	/**
	 * Update sync status
	 */
	private updateSyncStatus(
		configId: string,
		updates: Partial<CloudSyncStatus>
	): void {
		const status = this.syncStatuses.get(configId);
		if (status) {
			Object.assign(status, updates);
		}
	}

	/**
	 * Generate unique configuration ID
	 */
	private generateConfigId(): string {
		return `cloud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Load configurations from storage
	 */
	private async loadConfigurations(): Promise<void> {
		try {
			const data = await this.plugin.loadData();
			const configs = data?.cloudCalendarConfigs || {};

			for (const [id, config] of Object.entries(configs)) {
				this.configurations.set(id, config as CloudCalendarConfig);

				// Initialize sync status
				this.syncStatuses.set(id, {
					configId: id,
					provider: (config as CloudCalendarConfig).provider,
					status: "idle",
					lastSync: undefined,
					nextSync: undefined,
				});

				// Schedule sync if enabled
				if ((config as CloudCalendarConfig).enabled) {
					this.scheduleSync(id);
				}
			}

			console.log(
				`CloudCalendarManager: Loaded ${this.configurations.size} configurations`
			);
		} catch (error) {
			console.error(
				"CloudCalendarManager: Failed to load configurations:",
				error
			);
		}
	}

	/**
	 * Save configurations to storage
	 */
	private async saveConfigurations(): Promise<void> {
		try {
			const data = (await this.plugin.loadData()) || {};
			const configs: Record<string, CloudCalendarConfig> = {};

			for (const [id, config] of this.configurations) {
				configs[id] = config;
			}

			data.cloudCalendarConfigs = configs;
			await this.plugin.saveData(data);
		} catch (error) {
			console.error(
				"CloudCalendarManager: Failed to save configurations:",
				error
			);
		}
	}

	/**
	 * Component lifecycle - cleanup
	 */
	onunload(): void {
		// Cancel all sync intervals
		for (const intervalId of this.syncIntervals.values()) {
			window.clearInterval(intervalId);
		}
		this.syncIntervals.clear();

		// Cleanup URI handler
		this.uriHandler.cleanup();
	}
}
