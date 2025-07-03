/**
 * Obsidian URI Handler
 * Handles OAuth authentication callbacks via Obsidian URI protocol
 * Supports obsidian://oauth-callback and obsidian://icloud-auth schemes
 */

import { Plugin, Notice } from "obsidian";
import { OAuth2AuthResponse } from "../../types/cloud-calendar";
import { OAuth2Manager } from "./OAuth2Manager";
import { TaskProgressBarPlugin } from "../../index";

export class ObsidianURIHandler {
	private plugin: TaskProgressBarPlugin;
	private oauth2Manager: OAuth2Manager;
	private registeredSchemes: Set<string> = new Set();

	constructor(plugin: TaskProgressBarPlugin, oauth2Manager: OAuth2Manager) {
		this.plugin = plugin;
		this.oauth2Manager = oauth2Manager;
	}

	/**
	 * Initialize URI handler and register schemes
	 */
	initialize(): void {
		this.registerOAuthCallbackHandler();
		this.registeriCloudAuthHandler();
		console.log("ObsidianURIHandler: Initialized OAuth URI handlers");
	}

	/**
	 * Register OAuth callback handler for Google and other OAuth providers
	 */
	private registerOAuthCallbackHandler(): void {
		const scheme = "oauth-callback";

		if (this.registeredSchemes.has(scheme)) {
			return;
		}

		// Register URI handler with Obsidian
		this.plugin.registerObsidianProtocolHandler(scheme, (params) => {
			this.handleOAuthCallback(params);
		});

		this.registeredSchemes.add(scheme);
		console.log("ObsidianURIHandler: Registered oauth-callback handler");
	}

	/**
	 * Register iCloud authentication handler
	 */
	private registeriCloudAuthHandler(): void {
		const scheme = "icloud-auth";

		if (this.registeredSchemes.has(scheme)) {
			return;
		}

		// Register URI handler with Obsidian
		this.plugin.registerObsidianProtocolHandler(scheme, (params) => {
			this.handleiCloudAuth(params);
		});

		this.registeredSchemes.add(scheme);
		console.log("ObsidianURIHandler: Registered icloud-auth handler");
	}

	/**
	 * Handle OAuth callback from browser
	 */
	private async handleOAuthCallback(
		params: Record<string, string>
	): Promise<void> {
		try {
			console.log("ObsidianURIHandler: Received OAuth callback", params);

			// Extract OAuth response parameters
			const authResponse: OAuth2AuthResponse = {
				code: params.code,
				error: params.error,
				errorDescription: params.error_description,
				state: params.state,
			};

			// Validate required parameters
			if (!authResponse.state) {
				throw new Error("Missing state parameter in OAuth callback");
			}

			// Pass to OAuth2Manager for processing
			await this.oauth2Manager.handleAuthCallback(authResponse);

			// Show success notification
			this.showNotification(
				"OAuth authentication successful!",
				"success"
			);
		} catch (error) {
			console.error("ObsidianURIHandler: OAuth callback error:", error);

			const errorMessage =
				error instanceof Error ? error.message : "Unknown OAuth error";
			this.showNotification(
				`OAuth authentication failed: ${errorMessage}`,
				"error"
			);
		}
	}

	/**
	 * Handle iCloud authentication (app-specific password)
	 */
	private async handleiCloudAuth(
		params: Record<string, string>
	): Promise<void> {
		try {
			console.log("ObsidianURIHandler: Received iCloud auth", params);

			// iCloud uses different parameters
			const { username, password, action } = params;

			if (action === "setup") {
				// Show setup instructions
				this.showiCloudSetupInstructions();
				return;
			}

			if (!username || !password) {
				throw new Error(
					"Username and password are required for iCloud authentication"
				);
			}

			// Get iCloud provider
			const icloudProvider = this.oauth2Manager.getProvider("icloud");
			if (!icloudProvider) {
				throw new Error("iCloud provider not found");
			}

			// Validate credentials and create tokens
			const tokens = await (
				icloudProvider as any
			).createTokensFromCredentials(username, password);

			// Show success notification
			this.showNotification(
				"iCloud authentication successful!",
				"success"
			);

			// Store the successful authentication result
			// This would typically be handled by the calling component
			console.log("iCloud tokens created successfully");
		} catch (error) {
			console.error("ObsidianURIHandler: iCloud auth error:", error);

			const errorMessage =
				error instanceof Error ? error.message : "Unknown iCloud error";
			this.showNotification(
				`iCloud authentication failed: ${errorMessage}`,
				"error"
			);
		}
	}

	/**
	 * Generate OAuth redirect URI for the current plugin
	 */
	getOAuthRedirectUri(): string {
		return "obsidian://oauth-callback";
	}

	/**
	 * Generate iCloud auth URI for app-specific password flow
	 */
	getiCloudAuthUri(): string {
		return "obsidian://icloud-auth";
	}

	/**
	 * Create a deep link URL for OAuth authentication
	 */
	createOAuthDeepLink(provider: string, state: string): string {
		const params = new URLSearchParams({
			provider,
			state,
			redirect_uri: this.getOAuthRedirectUri(),
		});

		return `obsidian://oauth-callback?${params.toString()}`;
	}

	/**
	 * Create a deep link URL for iCloud authentication
	 */
	createiCloudDeepLink(username?: string, password?: string): string {
		const params = new URLSearchParams();

		if (username) params.set("username", username);
		if (password) params.set("password", password);

		return `obsidian://icloud-auth?${params.toString()}`;
	}

	/**
	 * Show iCloud setup instructions
	 */
	private showiCloudSetupInstructions(): void {
		const instructions = `
## iCloud Calendar Setup Instructions

### Prerequisites
- Two-factor authentication must be enabled on your Apple ID
- iCloud Calendar must be enabled in your Apple ID settings

### Steps to Generate App-Specific Password
1. Go to [Apple ID account page](https://appleid.apple.com/account/manage)
2. Sign in with your Apple ID
3. Navigate to the "Security" section
4. Find "App-Specific Passwords" and click "Generate Password"
5. Enter a label like "Obsidian Task Genius"
6. Copy the generated password (it will only be shown once)
7. Return to Obsidian and enter your Apple ID email and the app-specific password

### Troubleshooting
- If you can't see "App-Specific Passwords", ensure 2FA is enabled
- If connection fails, verify your Apple ID email is correct
- Make sure you're using the app-specific password, not your regular Apple ID password
		`;

		this.showNotification(instructions, "info", 30000); // Show for 30 seconds
	}

	/**
	 * Show notification to user
	 */
	private showNotification(
		message: string,
		type: "success" | "error" | "info" = "info",
		duration: number = 5000
	): void {
		// Use Obsidian's built-in notification system
		const notice = new Notice(message, duration);

		// Add custom styling based on type
		if (type === "success") {
			notice.messageEl.addClass("oauth-success");
		} else if (type === "error") {
			notice.messageEl.addClass("oauth-error");
		}
	}

	/**
	 * Parse URL parameters from URI
	 */
	private parseURIParams(uri: string): Record<string, string> {
		const url = new URL(uri);
		const params: Record<string, string> = {};

		for (const [key, value] of url.searchParams) {
			params[key] = value;
		}

		return params;
	}

	/**
	 * Validate URI scheme
	 */
	private isValidScheme(scheme: string): boolean {
		return this.registeredSchemes.has(scheme);
	}

	/**
	 * Handle URI with error recovery
	 */
	private async handleURIWithErrorRecovery(
		scheme: string,
		params: Record<string, string>,
		handler: (params: Record<string, string>) => Promise<void>
	): Promise<void> {
		try {
			await handler(params);
		} catch (error) {
			console.error(
				`ObsidianURIHandler: Error handling ${scheme}:`,
				error
			);

			// Attempt to provide helpful error messages
			let userMessage = "Authentication failed";

			if (error instanceof Error) {
				if (error.message.includes("state")) {
					userMessage =
						"Authentication session expired. Please try again.";
				} else if (error.message.includes("code")) {
					userMessage =
						"Invalid authorization code. Please try again.";
				} else if (error.message.includes("network")) {
					userMessage =
						"Network error. Please check your internet connection.";
				} else {
					userMessage = `Authentication failed: ${error.message}`;
				}
			}

			this.showNotification(userMessage, "error");
		}
	}

	/**
	 * Get supported URI schemes
	 */
	getSupportedSchemes(): string[] {
		return Array.from(this.registeredSchemes);
	}

	/**
	 * Check if a URI scheme is supported
	 */
	isSchemeSupported(scheme: string): boolean {
		return this.registeredSchemes.has(scheme);
	}

	/**
	 * Cleanup URI handlers
	 */
	cleanup(): void {
		// Obsidian handles cleanup automatically when plugin is disabled
		this.registeredSchemes.clear();
		console.log("ObsidianURIHandler: Cleaned up URI handlers");
	}
}

/**
 * URI Handler Configuration
 */
export interface URIHandlerConfig {
	/** Whether to enable OAuth callback handling */
	enableOAuthCallback: boolean;
	/** Whether to enable iCloud authentication handling */
	enableiCloudAuth: boolean;
	/** Custom redirect URI prefix */
	customRedirectPrefix?: string;
	/** Timeout for authentication flows (ms) */
	authTimeout: number;
}

/**
 * Default URI handler configuration
 */
export const DEFAULT_URI_HANDLER_CONFIG: URIHandlerConfig = {
	enableOAuthCallback: true,
	enableiCloudAuth: true,
	authTimeout: 300000, // 5 minutes
};
