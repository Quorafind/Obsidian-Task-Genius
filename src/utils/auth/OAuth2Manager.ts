/**
 * OAuth 2.0 Authentication Manager
 * Handles OAuth authentication flows for cloud calendar providers
 */

import { Component } from "obsidian";
import {
	OAuth2Config,
	OAuth2Tokens,
	OAuth2AuthRequest,
	OAuth2AuthResponse,
} from "../../types/cloud-calendar";
import { OAuth2Provider } from "./OAuth2Provider";
import TaskProgressBarPlugin from "../../index";

export class OAuth2Manager extends Component {
	private plugin: TaskProgressBarPlugin;
	private providers: Map<string, OAuth2Provider> = new Map();
	private pendingAuthRequests: Map<string, OAuth2AuthRequest> = new Map();

	constructor(plugin: TaskProgressBarPlugin) {
		super();
		this.plugin = plugin;
	}

	/**
	 * Register an OAuth 2.0 provider
	 */
	registerProvider(name: string, provider: OAuth2Provider): void {
		this.providers.set(name, provider);
		console.log(`OAuth2Manager: Registered provider ${name}`);
	}

	/**
	 * Get a registered provider
	 */
	getProvider(name: string): OAuth2Provider | undefined {
		return this.providers.get(name);
	}

	/**
	 * Start OAuth 2.0 authentication flow
	 */
	async authenticate(
		provider: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		const oauthProvider = this.providers.get(provider);
		if (!oauthProvider) {
			throw new Error(`OAuth provider ${provider} not found`);
		}

		try {
			// Generate state parameter for security
			const state = this.generateState();

			// Create auth request
			const authRequest: OAuth2AuthRequest = {
				provider,
				clientId: config.clientId,
				redirectUri: config.redirectUri,
				scopes: config.scopes,
				state,
				authUrl: oauthProvider.buildAuthUrl(config),
			};

			// Store pending request
			this.pendingAuthRequests.set(state, authRequest);

			// Open browser for authentication
			await this.openBrowserForAuth(authRequest);

			// Return a promise that resolves when auth completes
			return new Promise((resolve, reject) => {
				// Set up timeout
				const timeout = setTimeout(() => {
					this.pendingAuthRequests.delete(state);
					reject(new Error("Authentication timeout"));
				}, 300000); // 5 minutes

				// Store resolve/reject functions for later use
				(authRequest as any).resolve = (tokens: OAuth2Tokens) => {
					clearTimeout(timeout);
					this.pendingAuthRequests.delete(state);
					resolve(tokens);
				};
				(authRequest as any).reject = (error: Error) => {
					clearTimeout(timeout);
					this.pendingAuthRequests.delete(state);
					reject(error);
				};
			});
		} catch (error) {
			console.error(
				`OAuth2Manager: Authentication failed for ${provider}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Handle OAuth callback with authorization code
	 */
	async handleAuthCallback(response: OAuth2AuthResponse): Promise<void> {
		const { code, error, errorDescription, state } = response;

		if (!state) {
			throw new Error("Missing state parameter in OAuth callback");
		}

		const authRequest = this.pendingAuthRequests.get(state);
		if (!authRequest) {
			throw new Error("Invalid or expired OAuth state");
		}

		const resolve = (authRequest as any).resolve;
		const reject = (authRequest as any).reject;

		if (error) {
			const errorMsg = errorDescription || error;
			reject(new Error(`OAuth authentication failed: ${errorMsg}`));
			return;
		}

		if (!code) {
			reject(new Error("Missing authorization code in OAuth callback"));
			return;
		}

		try {
			const provider = this.providers.get(authRequest.provider);
			if (!provider) {
				throw new Error(
					`OAuth provider ${authRequest.provider} not found`
				);
			}

			// Exchange authorization code for tokens
			const config: OAuth2Config = {
				clientId: authRequest.clientId,
				redirectUri: authRequest.redirectUri,
				scopes: authRequest.scopes,
			};

			const tokens = await provider.exchangeCodeForTokens(code, config);
			resolve(tokens);
		} catch (error) {
			reject(error);
		}
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshToken(
		provider: string,
		refreshToken: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		const oauthProvider = this.providers.get(provider);
		if (!oauthProvider) {
			throw new Error(`OAuth provider ${provider} not found`);
		}

		try {
			return await oauthProvider.refreshAccessToken(refreshToken, config);
		} catch (error) {
			console.error(
				`OAuth2Manager: Token refresh failed for ${provider}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Validate access token
	 */
	async validateToken(
		provider: string,
		accessToken: string
	): Promise<boolean> {
		const oauthProvider = this.providers.get(provider);
		if (!oauthProvider) {
			throw new Error(`OAuth provider ${provider} not found`);
		}

		try {
			return await oauthProvider.validateToken(accessToken);
		} catch (error) {
			console.error(
				`OAuth2Manager: Token validation failed for ${provider}:`,
				error
			);
			return false;
		}
	}

	/**
	 * Revoke access token
	 */
	async revokeToken(
		provider: string,
		token: string,
		config: OAuth2Config
	): Promise<void> {
		const oauthProvider = this.providers.get(provider);
		if (!oauthProvider) {
			throw new Error(`OAuth provider ${provider} not found`);
		}

		try {
			await oauthProvider.revokeToken(token, config);
		} catch (error) {
			console.error(
				`OAuth2Manager: Token revocation failed for ${provider}:`,
				error
			);
			throw error;
		}
	}

	/**
	 * Check if token is expired or about to expire
	 */
	isTokenExpired(tokenExpiry: number, bufferMinutes: number = 5): boolean {
		const now = Date.now();
		const expiryWithBuffer = tokenExpiry - bufferMinutes * 60 * 1000;
		return now >= expiryWithBuffer;
	}

	/**
	 * Generate secure random state parameter
	 */
	private generateState(): string {
		const array = new Uint8Array(32);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) =>
			byte.toString(16).padStart(2, "0")
		).join("");
	}

	/**
	 * Open system browser for OAuth authentication
	 */
	private async openBrowserForAuth(
		authRequest: OAuth2AuthRequest
	): Promise<void> {
		try {
			// Use Obsidian's built-in method to open external links
			window.open(authRequest.authUrl, "_blank");
		} catch (error) {
			console.error("OAuth2Manager: Failed to open browser:", error);
			throw new Error("Failed to open browser for authentication");
		}
	}

	/**
	 * Get OAuth redirect URI for Obsidian
	 */
	getObsidianRedirectUri(): string {
		// Use Obsidian URI protocol for OAuth callbacks
		return "obsidian://oauth-callback";
	}

	/**
	 * Clean up expired auth requests
	 */
	private cleanupExpiredRequests(): void {
		const now = Date.now();
		const expiredStates: string[] = [];

		for (const [state, request] of this.pendingAuthRequests) {
			// Remove requests older than 10 minutes
			if (now - Date.now() > 600000) {
				expiredStates.push(state);
			}
		}

		expiredStates.forEach((state) => {
			this.pendingAuthRequests.delete(state);
		});
	}

	/**
	 * Component lifecycle - start cleanup timer
	 */
	onload(): void {
		// Clean up expired requests every 5 minutes
		this.registerInterval(
			window.setInterval(() => {
				this.cleanupExpiredRequests();
			}, 300000)
		);
	}

	/**
	 * Component lifecycle - cleanup
	 */
	onunload(): void {
		this.pendingAuthRequests.clear();
		this.providers.clear();
	}
}
