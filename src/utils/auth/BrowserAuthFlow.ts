/**
 * Browser Authentication Flow Manager
 * Manages OAuth authentication flows that require browser interaction
 * Integrates with Obsidian URI handler for seamless auth experience
 */

import { Component, Notice } from "obsidian";
import { OAuth2Manager } from "./OAuth2Manager";
import { ObsidianURIHandler } from "./ObsidianURIHandler";
import { OAuth2Config, OAuth2Tokens } from "../../types/cloud-calendar";
import TaskProgressBarPlugin from "../../index";

export class BrowserAuthFlow extends Component {
	private plugin: TaskProgressBarPlugin;
	private oauth2Manager: OAuth2Manager;
	private uriHandler: ObsidianURIHandler;
	private activeFlows: Map<string, AuthFlowContext> = new Map();

	constructor(
		plugin: TaskProgressBarPlugin,
		oauth2Manager: OAuth2Manager,
		uriHandler: ObsidianURIHandler
	) {
		super();
		this.plugin = plugin;
		this.oauth2Manager = oauth2Manager;
		this.uriHandler = uriHandler;
	}

	/**
	 * Start OAuth authentication flow in browser
	 */
	async startOAuthFlow(
		provider: string,
		config: OAuth2Config,
		options: AuthFlowOptions = {}
	): Promise<OAuth2Tokens> {
		const flowId = this.generateFlowId();

		try {
			// Create flow context
			const context: AuthFlowContext = {
				id: flowId,
				provider,
				config,
				startTime: Date.now(),
				status: "starting",
				options,
			};

			this.activeFlows.set(flowId, context);

			// Update redirect URI to use Obsidian protocol
			const updatedConfig = {
				...config,
				redirectUri: this.uriHandler.getOAuthRedirectUri(),
			};

			// Show user notification about browser opening
			this.showFlowNotification(
				`Opening browser for ${provider} authentication...`,
				"info"
			);

			// Start OAuth flow
			context.status = "browser_opened";
			const tokens = await this.oauth2Manager.authenticate(
				provider,
				updatedConfig
			);

			// Success
			context.status = "completed";
			context.tokens = tokens;

			this.showFlowNotification(
				`${provider} authentication successful!`,
				"success"
			);

			return tokens;
		} catch (error) {
			// Handle errors
			const context = this.activeFlows.get(flowId);
			if (context) {
				context.status = "error";
				context.error =
					error instanceof Error ? error.message : "Unknown error";
			}

			console.error(
				`BrowserAuthFlow: OAuth flow failed for ${provider}:`,
				error
			);

			const errorMessage = this.getHelpfulErrorMessage(error, provider);
			this.showFlowNotification(errorMessage, "error");

			throw error;
		} finally {
			// Cleanup flow context after delay
			setTimeout(() => {
				this.activeFlows.delete(flowId);
			}, 30000); // Keep for 30 seconds for debugging
		}
	}

	/**
	 * Start iCloud authentication flow (app-specific password)
	 */
	async startiCloudFlow(
		username: string,
		appPassword: string,
		options: AuthFlowOptions = {}
	): Promise<OAuth2Tokens> {
		const flowId = this.generateFlowId();

		try {
			// Create flow context
			const context: AuthFlowContext = {
				id: flowId,
				provider: "icloud",
				config: {
					clientId: "", // Not used for iCloud
					scopes: ["calendar"],
					redirectUri: this.uriHandler.getiCloudAuthUri(),
				},
				startTime: Date.now(),
				status: "starting",
				options,
			};

			this.activeFlows.set(flowId, context);

			// Get iCloud provider
			const icloudProvider = this.oauth2Manager.getProvider("icloud");
			if (!icloudProvider) {
				throw new Error("iCloud provider not registered");
			}

			// Show progress notification
			this.showFlowNotification(
				"Validating iCloud credentials...",
				"info"
			);

			// Create tokens from credentials
			context.status = "validating";
			const tokens = await (
				icloudProvider as any
			).createTokensFromCredentials(username, appPassword);

			// Success
			context.status = "completed";
			context.tokens = tokens;

			this.showFlowNotification(
				"iCloud authentication successful!",
				"success"
			);

			return tokens;
		} catch (error) {
			// Handle errors
			const context = this.activeFlows.get(flowId);
			if (context) {
				context.status = "error";
				context.error =
					error instanceof Error ? error.message : "Unknown error";
			}

			console.error("BrowserAuthFlow: iCloud flow failed:", error);

			const errorMessage = this.getHelpfulErrorMessage(error, "icloud");
			this.showFlowNotification(errorMessage, "error");

			throw error;
		} finally {
			// Cleanup flow context
			setTimeout(() => {
				this.activeFlows.delete(flowId);
			}, 30000);
		}
	}

	/**
	 * Show setup instructions for iCloud
	 */
	showiCloudSetupInstructions(): void {
		const instructions = `
## iCloud Calendar Setup

### Step 1: Enable Two-Factor Authentication
1. Go to appleid.apple.com
2. Sign in with your Apple ID
3. Navigate to Security section
4. Enable Two-Factor Authentication if not already enabled

### Step 2: Generate App-Specific Password
1. In the Security section, find "App-Specific Passwords"
2. Click "Generate Password"
3. Enter label: "Obsidian Task Genius"
4. Copy the generated password (shown only once!)

### Step 3: Connect in Obsidian
1. Use your Apple ID email as username
2. Use the app-specific password (not your regular password)
3. Click "Connect" to authenticate

**Important:** Save the app-specific password securely - it cannot be viewed again!
		`;

		this.showFlowNotification(instructions, "info", 45000); // Show for 45 seconds
	}

	/**
	 * Get status of active authentication flows
	 */
	getActiveFlows(): AuthFlowStatus[] {
		return Array.from(this.activeFlows.values()).map((context) => ({
			id: context.id,
			provider: context.provider,
			status: context.status,
			startTime: context.startTime,
			duration: Date.now() - context.startTime,
			error: context.error,
		}));
	}

	/**
	 * Cancel an active authentication flow
	 */
	cancelFlow(flowId: string): boolean {
		const context = this.activeFlows.get(flowId);
		if (!context) {
			return false;
		}

		context.status = "cancelled";
		this.activeFlows.delete(flowId);

		this.showFlowNotification(
			`${context.provider} authentication cancelled`,
			"info"
		);

		return true;
	}

	/**
	 * Cancel all active flows
	 */
	cancelAllFlows(): void {
		const activeCount = this.activeFlows.size;

		for (const [flowId, context] of this.activeFlows) {
			context.status = "cancelled";
		}

		this.activeFlows.clear();

		if (activeCount > 0) {
			this.showFlowNotification(
				`Cancelled ${activeCount} active authentication flow(s)`,
				"info"
			);
		}
	}

	/**
	 * Open browser for manual OAuth flow
	 */
	async openBrowserForManualAuth(
		provider: string,
		config: OAuth2Config
	): Promise<string> {
		const oauthProvider = this.oauth2Manager.getProvider(provider);
		if (!oauthProvider) {
			throw new Error(`Provider ${provider} not found`);
		}

		// Build auth URL
		const authUrl = oauthProvider.buildAuthUrl({
			...config,
			redirectUri: this.uriHandler.getOAuthRedirectUri(),
		});

		// Open browser
		try {
			window.open(authUrl, "_blank");

			this.showFlowNotification(
				`Browser opened for ${provider} authentication. Complete the process and return to Obsidian.`,
				"info",
				10000
			);

			return authUrl;
		} catch (error) {
			throw new Error(
				`Failed to open browser: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	}

	/**
	 * Generate unique flow ID
	 */
	private generateFlowId(): string {
		return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	/**
	 * Get helpful error message for users
	 */
	private getHelpfulErrorMessage(error: unknown, provider: string): string {
		const baseMessage =
			error instanceof Error ? error.message : "Unknown error";

		// Provider-specific error messages
		if (provider === "google") {
			if (baseMessage.includes("invalid_client")) {
				return "Invalid Google Client ID. Please check your OAuth configuration.";
			}
			if (baseMessage.includes("redirect_uri_mismatch")) {
				return "Redirect URI mismatch. Please add 'obsidian://oauth-callback' to your Google OAuth app.";
			}
			if (baseMessage.includes("access_denied")) {
				return "Google authentication was cancelled or denied.";
			}
		}

		if (provider === "icloud") {
			if (
				baseMessage.includes("invalid_grant") ||
				baseMessage.includes("401")
			) {
				return "Invalid Apple ID or app-specific password. Please check your credentials.";
			}
			if (baseMessage.includes("two-factor")) {
				return "Two-factor authentication is required. Please enable 2FA on your Apple ID.";
			}
		}

		// Network errors
		if (baseMessage.includes("network") || baseMessage.includes("fetch")) {
			return "Network error. Please check your internet connection and try again.";
		}

		// Timeout errors
		if (baseMessage.includes("timeout")) {
			return "Authentication timed out. Please try again.";
		}

		return `Authentication failed: ${baseMessage}`;
	}

	/**
	 * Show flow notification with appropriate styling
	 */
	private showFlowNotification(
		message: string,
		type: "info" | "success" | "error" = "info",
		duration: number = 5000
	): void {
		const notice = new Notice(message, duration);

		// Add custom styling
		notice.messageEl.addClass(`auth-flow-${type}`);

		// Add icon based on type
		const icon = type === "success" ? "✓" : type === "error" ? "✗" : "ℹ";
		notice.messageEl.prepend(
			createSpan({ text: icon, cls: "auth-flow-icon" })
		);
	}

	/**
	 * Component lifecycle - cleanup
	 */
	onunload(): void {
		this.cancelAllFlows();
	}
}

/**
 * Authentication flow context
 */
interface AuthFlowContext {
	/** Unique flow identifier */
	id: string;
	/** OAuth provider name */
	provider: string;
	/** OAuth configuration */
	config: OAuth2Config;
	/** Flow start timestamp */
	startTime: number;
	/** Current flow status */
	status: AuthFlowStatus["status"];
	/** Flow options */
	options: AuthFlowOptions;
	/** Resulting tokens (if successful) */
	tokens?: OAuth2Tokens;
	/** Error message (if failed) */
	error?: string;
}

/**
 * Authentication flow options
 */
export interface AuthFlowOptions {
	/** Whether to show notifications */
	showNotifications?: boolean;
	/** Custom timeout in milliseconds */
	timeout?: number;
	/** Whether to open browser automatically */
	autoOpenBrowser?: boolean;
	/** Custom success callback */
	onSuccess?: (tokens: OAuth2Tokens) => void;
	/** Custom error callback */
	onError?: (error: Error) => void;
}

/**
 * Authentication flow status
 */
export interface AuthFlowStatus {
	/** Flow identifier */
	id: string;
	/** Provider name */
	provider: string;
	/** Current status */
	status:
		| "starting"
		| "browser_opened"
		| "validating"
		| "completed"
		| "error"
		| "cancelled";
	/** Start timestamp */
	startTime: number;
	/** Duration in milliseconds */
	duration: number;
	/** Error message if failed */
	error?: string;
}
