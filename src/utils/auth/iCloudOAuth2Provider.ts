/**
 * iCloud OAuth 2.0 Provider
 * Implements authentication for iCloud Calendar using CalDAV
 * Note: iCloud uses App-Specific Passwords instead of traditional OAuth
 */

import { OAuth2Provider, OAuth2Error } from "./OAuth2Provider";
import { OAuth2Config, OAuth2Tokens } from "../../types/cloud-calendar";
import { requestUrl } from "obsidian";

export class iCloudOAuth2Provider extends OAuth2Provider {
	readonly name = "icloud";
	readonly authUrl = "https://appleid.apple.com/account/manage";
	readonly tokenUrl = ""; // Not used for iCloud
	readonly caldavUrl = "https://caldav.icloud.com";

	readonly defaultScopes = ["calendar"];

	/**
	 * Build iCloud authentication URL
	 * This redirects to Apple ID management page for app-specific password creation
	 */
	buildAuthUrl(config: OAuth2Config): string {
		// iCloud doesn't use traditional OAuth, redirect to app-specific password page
		return `${this.authUrl}#security`;
	}

	/**
	 * iCloud doesn't use authorization codes
	 * Instead, it uses username + app-specific password
	 */
	async exchangeCodeForTokens(
		code: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		throw new OAuth2Error(
			"not_supported",
			"iCloud doesn't use authorization codes. Use username and app-specific password instead."
		);
	}

	/**
	 * Create tokens from username and app-specific password
	 */
	async createTokensFromCredentials(
		username: string,
		appPassword: string
	): Promise<OAuth2Tokens> {
		if (!username || !appPassword) {
			throw new OAuth2Error(
				"invalid_request",
				"Username and app-specific password are required"
			);
		}

		// Validate and normalize username
		const validatedUsername = this.validateAndNormalizeUsername(username);
		const validatedPassword = this.validateAppSpecificPassword(appPassword);

		// Validate credentials by making a test CalDAV request
		try {
			const isValid = await this.validateCredentials(
				validatedUsername,
				validatedPassword
			);
			if (!isValid) {
				throw new OAuth2Error(
					"invalid_grant",
					"Invalid username or app-specific password. Please check your Apple ID and ensure you're using an app-specific password (not your regular Apple ID password)."
				);
			}
		} catch (error) {
			if (error instanceof OAuth2Error) {
				// Re-throw OAuth2Error with potentially more specific message
				if (error.code === "network_error") {
					throw new OAuth2Error(
						"network_error",
						"Unable to connect to iCloud servers. Please check your internet connection and try again."
					);
				}
				throw error;
			} else {
				// Handle unexpected errors
				throw new OAuth2Error(
					"unknown_error",
					"An unexpected error occurred during authentication. Please try again."
				);
			}
		}

		// Create a pseudo-token using base64 encoded credentials
		const credentials = btoa(`${validatedUsername}:${validatedPassword}`);

		return {
			accessToken: credentials,
			refreshToken: credentials, // Same as access token for iCloud
			tokenType: "Basic",
			expiresIn: 365 * 24 * 60 * 60, // 1 year (app-specific passwords don't expire)
			scope: "calendar",
			issuedAt: Date.now(),
		};
	}

	/**
	 * iCloud app-specific passwords don't expire, so refresh is not needed
	 */
	async refreshAccessToken(
		refreshToken: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		// Validate the existing token
		const isValid = await this.validateToken(refreshToken);
		if (!isValid) {
			throw new OAuth2Error(
				"invalid_grant",
				"App-specific password is no longer valid"
			);
		}

		// Return the same token with updated timestamp
		return {
			accessToken: refreshToken,
			refreshToken: refreshToken,
			tokenType: "Basic",
			expiresIn: 365 * 24 * 60 * 60, // 1 year
			scope: "calendar",
			issuedAt: Date.now(),
		};
	}

	/**
	 * Validate app-specific password by making a CalDAV request
	 */
	async validateToken(accessToken: string): Promise<boolean> {
		if (!accessToken) {
			return false;
		}

		try {
			// Decode credentials from token
			const credentials = atob(accessToken);
			const [username, password] = credentials.split(":");

			return await this.validateCredentials(username, password);
		} catch (error) {
			return false;
		}
	}

	/**
	 * Revoke app-specific password (not possible programmatically)
	 */
	async revokeToken(token: string, config: OAuth2Config): Promise<void> {
		// iCloud app-specific passwords must be revoked manually by the user
		throw new OAuth2Error(
			"not_supported",
			"iCloud app-specific passwords must be revoked manually in Apple ID settings"
		);
	}

	/**
	 * Validate iCloud credentials by making a CalDAV PROPFIND request
	 */
	private async validateCredentials(
		username: string,
		password: string
	): Promise<boolean> {
		try {
			// Normalize username - remove @icloud.com if present
			const normalizedUsername = username.replace(/@icloud\.com$/, "");

			// Try the principal URL first for better compatibility
			const principalUrl = `${this.caldavUrl}/${normalizedUsername}/principal/`;

			console.log(
				`Attempting iCloud CalDAV authentication for user: ${normalizedUsername}`
			);

			const response = await this.makeCalDAVRequest(
				principalUrl,
				"PROPFIND",
				{
					Authorization: `Basic ${btoa(`${username}:${password}`)}`,
					"Content-Type": "application/xml; charset=utf-8",
					Depth: "0",
				},
				'<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>'
			);

			// Accept both 207 (Multi-Status) and 200 (OK) as success
			const isSuccess =
				response.status === 207 || response.status === 200;

			if (!isSuccess) {
				console.warn(
					`iCloud CalDAV principal URL failed with status ${response.status}`
				);

				// Check for specific authentication errors
				if (response.status === 401) {
					console.error(
						"Authentication failed - invalid credentials"
					);
					return false;
				}

				if (response.status === 403) {
					console.error(
						"Access forbidden - check if 2FA is enabled and app-specific password is correct"
					);
					return false;
				}

				// Try alternative URL format if principal fails
				console.log("Trying alternative CalDAV URL format...");
				const alternativeUrl = `${this.caldavUrl}/${normalizedUsername}/calendars/`;

				try {
					const altResponse = await this.makeCalDAVRequest(
						alternativeUrl,
						"PROPFIND",
						{
							Authorization: `Basic ${btoa(
								`${username}:${password}`
							)}`,
							"Content-Type": "application/xml; charset=utf-8",
							Depth: "0",
						},
						'<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><displayname/></prop></propfind>'
					);

					const altSuccess =
						altResponse.status === 207 ||
						altResponse.status === 200;

					if (altSuccess) {
						console.log("Alternative CalDAV URL succeeded");
					} else {
						console.warn(
							`Alternative CalDAV URL also failed with status ${altResponse.status}`
						);

						// Provide specific error information
						if (altResponse.status === 401) {
							console.error(
								"Authentication failed on alternative URL - credentials are invalid"
							);
						} else if (altResponse.status === 403) {
							console.error(
								"Access forbidden on alternative URL - check permissions"
							);
						}
					}

					return altSuccess;
				} catch (altError) {
					console.error(
						"Alternative CalDAV URL request failed:",
						altError
					);
					return false;
				}
			}

			console.log("iCloud CalDAV authentication successful");
			return isSuccess;
		} catch (error) {
			if (error instanceof OAuth2Error) {
				console.error(
					"iCloud credential validation failed:",
					error.message
				);
				// Re-throw OAuth2Error to preserve error details
				throw error;
			} else {
				console.error(
					"iCloud credential validation failed with unexpected error:",
					error
				);
				// Convert unexpected errors to OAuth2Error
				throw new OAuth2Error(
					"network_error",
					error instanceof Error
						? error.message
						: "Unknown network error occurred"
				);
			}
		}
	}

	/**
	 * Make CalDAV request to iCloud using Obsidian's requestUrl API
	 */
	private async makeCalDAVRequest(
		url: string,
		method: string,
		headers: Record<string, string>,
		body?: string
	): Promise<Response> {
		try {
			const response = await requestUrl({
				url,
				method,
				headers,
				body,
				throw: false, // Don't throw on HTTP errors, handle them manually
			});

			// Convert Obsidian's response format to standard Response-like object
			return {
				status: response.status,
				statusText: response.status.toString(),
				ok: response.status >= 200 && response.status < 300,
				headers: new Headers(response.headers || {}),
				text: async () => response.text || "",
				json: async () => {
					try {
						return (
							response.json || JSON.parse(response.text || "{}")
						);
					} catch {
						return {};
					}
				},
			} as Response;
		} catch (error) {
			throw new OAuth2Error(
				"network_error",
				error instanceof Error ? error.message : "CalDAV request failed"
			);
		}
	}

	/**
	 * Get iCloud user information from username
	 */
	async getUserInfo(accessToken: string): Promise<iCloudUserInfo> {
		try {
			// Decode credentials from token
			const credentials = atob(accessToken);
			const [username] = credentials.split(":");

			// Extract user info from username (usually email format)
			const email = username.includes("@")
				? username
				: `${username}@icloud.com`;

			return {
				id: username,
				email: email,
				name: username.split("@")[0], // Use username part as name
				provider: "icloud",
			};
		} catch (error) {
			throw new OAuth2Error(
				"invalid_token",
				"Cannot extract user info from token"
			);
		}
	}

	/**
	 * Get the direct URL to Apple ID App-Specific Password creation page
	 */
	getAppSpecificPasswordUrl(): string {
		return `${this.authUrl}#security`;
	}

	/**
	 * Get iCloud-specific provider capabilities
	 */
	getCapabilities() {
		return {
			...super.getCapabilities(),
			name: this.name,
			supportsRefreshToken: false, // App-specific passwords don't need refresh
			supportsTokenRevocation: false, // Must be done manually
			requiresClientSecret: false,
			supportsPKCE: false,
			supportsAppSpecificPassword: true,
			usesCalDAV: true,
			tokenLifetime: 365 * 24 * 60 * 60, // 1 year
		};
	}

	/**
	 * Get instructions for creating app-specific password
	 */
	getSetupInstructions(): iCloudSetupInstructions {
		return {
			title: "Setup iCloud Calendar Access",
			steps: [
				"Go to Apple ID account page (appleid.apple.com)",
				"Sign in with your Apple ID",
				"Navigate to 'Security' section",
				"Find 'App-Specific Passwords' and click 'Generate Password'",
				"Enter a label like 'Obsidian Task Genius'",
				"Copy the generated password",
				"Use your Apple ID email and the app-specific password to connect",
			],
			requirements: [
				"Two-factor authentication must be enabled on your Apple ID",
				"You must have iCloud Calendar enabled",
				"The app-specific password is only shown once, so save it securely",
			],
			troubleshooting: [
				"If you can't see 'App-Specific Passwords', ensure 2FA is enabled",
				"If connection fails, verify your Apple ID email is correct",
				"Make sure you're using the app-specific password, not your regular Apple ID password",
			],
		};
	}

	/**
	 * Check if two-factor authentication is likely enabled
	 * This is a heuristic check based on common error patterns
	 */
	async checkTwoFactorEnabled(
		username: string,
		password: string
	): Promise<boolean> {
		try {
			await this.validateCredentials(username, password);
			return true; // If validation succeeds, 2FA is likely enabled
		} catch (error) {
			if (error instanceof OAuth2Error) {
				// Specific error codes that might indicate 2FA issues
				return (
					error.description.includes("two-factor") ||
					error.description.includes("2FA") ||
					error.statusCode === 401
				);
			}
			return false;
		}
	}

	/**
	 * Validate and normalize Apple ID username
	 */
	private validateAndNormalizeUsername(username: string): string {
		if (!username || typeof username !== "string") {
			throw new OAuth2Error("invalid_request", "Username is required");
		}

		const trimmed = username.trim();
		if (!trimmed) {
			throw new OAuth2Error(
				"invalid_request",
				"Username cannot be empty"
			);
		}

		// Basic email format validation
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		if (!emailRegex.test(trimmed)) {
			throw new OAuth2Error(
				"invalid_request",
				"Please enter a valid Apple ID email address"
			);
		}

		// Normalize to lowercase
		return trimmed.toLowerCase();
	}

	/**
	 * Validate app-specific password format
	 */
	private validateAppSpecificPassword(password: string): string {
		if (!password || typeof password !== "string") {
			throw new OAuth2Error(
				"invalid_request",
				"App-specific password is required"
			);
		}

		const trimmed = password.trim();
		if (!trimmed) {
			throw new OAuth2Error(
				"invalid_request",
				"App-specific password cannot be empty"
			);
		}

		// Remove any spaces or hyphens that might be in the password
		const cleaned = trimmed.replace(/[\s-]/g, "");

		// App-specific passwords are typically 16 characters long
		if (cleaned.length < 12) {
			throw new OAuth2Error(
				"invalid_request",
				"App-specific password appears to be too short. Please ensure you're using the complete app-specific password."
			);
		}

		return cleaned;
	}

	/**
	 * Get CalDAV principal URL for the user
	 */
	async getPrincipalUrl(username: string, password: string): Promise<string> {
		const validatedUsername = this.validateAndNormalizeUsername(username);
		const normalizedUsername = validatedUsername.replace(
			/@icloud\.com$/,
			""
		);

		const isValid = await this.validateCredentials(
			validatedUsername,
			password
		);
		if (!isValid) {
			throw new OAuth2Error(
				"invalid_credentials",
				"Invalid username or password"
			);
		}

		return `${this.caldavUrl}/${normalizedUsername}/`;
	}

	/**
	 * Validate iCloud-specific configuration
	 */
	protected validateConfig(config: OAuth2Config): void {
		// iCloud doesn't use traditional OAuth config
		// Skip the standard validation
		if (!config.redirectUri) {
			// Set a dummy redirect URI for compatibility
			config.redirectUri = "obsidian://icloud-auth";
		}
	}
}

/**
 * iCloud User Information
 */
export interface iCloudUserInfo {
	/** User ID (usually Apple ID username) */
	id: string;
	/** Email address */
	email: string;
	/** Display name */
	name: string;
	/** Provider identifier */
	provider: "icloud";
}

/**
 * iCloud Setup Instructions
 */
export interface iCloudSetupInstructions {
	/** Instruction title */
	title: string;
	/** Step-by-step instructions */
	steps: string[];
	/** Requirements and prerequisites */
	requirements: string[];
	/** Troubleshooting tips */
	troubleshooting: string[];
}
