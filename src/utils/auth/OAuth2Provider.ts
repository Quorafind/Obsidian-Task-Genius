/**
 * OAuth 2.0 Provider Abstract Base Class
 * Defines the interface for OAuth 2.0 authentication providers
 */

import { requestUrl, RequestUrlParam } from "obsidian";
import { OAuth2Config, OAuth2Tokens } from "../../types/cloud-calendar";

export abstract class OAuth2Provider {
	/** Provider name identifier */
	abstract readonly name: string;

	/** OAuth authorization endpoint URL */
	abstract readonly authUrl: string;

	/** OAuth token endpoint URL */
	abstract readonly tokenUrl: string;

	/** Default scopes for this provider */
	abstract readonly defaultScopes: string[];

	/**
	 * Build OAuth authorization URL
	 */
	abstract buildAuthUrl(config: OAuth2Config): string;

	/**
	 * Exchange authorization code for access tokens
	 */
	abstract exchangeCodeForTokens(
		code: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens>;

	/**
	 * Refresh access token using refresh token
	 */
	abstract refreshAccessToken(
		refreshToken: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens>;

	/**
	 * Validate access token
	 */
	abstract validateToken(accessToken: string): Promise<boolean>;

	/**
	 * Revoke access token
	 */
	abstract revokeToken(token: string, config: OAuth2Config): Promise<void>;

	/**
	 * Get provider capabilities
	 */
	getCapabilities(): OAuth2ProviderCapabilities {
		return {
			name: this.name,
			supportsRefreshToken: true,
			supportsTokenRevocation: true,
			supportsTokenValidation: true,
			requiresClientSecret: true,
			supportsPKCE: false,
			defaultScopes: this.defaultScopes,
		};
	}

	/**
	 * Helper method to make HTTP requests with proper error handling
	 */
	protected async makeRequest(params: RequestUrlParam): Promise<any> {
		try {
			const response = await requestUrl(params);

			if (response.status >= 400) {
				const errorData = this.parseErrorResponse(response);
				throw new OAuth2Error(
					errorData.error || "unknown_error",
					errorData.error_description || `HTTP ${response.status}`,
					response.status
				);
			}

			return response.json;
		} catch (error) {
			if (error instanceof OAuth2Error) {
				throw error;
			}

			// Network or other errors
			throw new OAuth2Error(
				"network_error",
				error instanceof Error
					? error.message
					: "Network request failed",
				0
			);
		}
	}

	/**
	 * Parse error response from OAuth provider
	 */
	protected parseErrorResponse(response: any): OAuth2ErrorResponse {
		try {
			if (response.json) {
				return response.json;
			}

			if (response.text) {
				// Try to parse as JSON
				return JSON.parse(response.text);
			}
		} catch (e) {
			// If parsing fails, return generic error
		}

		return {
			error: "unknown_error",
			error_description: `HTTP ${response.status}`,
		};
	}

	/**
	 * Build query string from parameters
	 */
	protected buildQueryString(params: Record<string, string>): string {
		const searchParams = new URLSearchParams();

		for (const [key, value] of Object.entries(params)) {
			if (value) {
				searchParams.append(key, value);
			}
		}

		return searchParams.toString();
	}

	/**
	 * Validate OAuth configuration
	 */
	protected validateConfig(config: OAuth2Config): void {
		if (!config.clientId) {
			throw new Error("Client ID is required");
		}

		if (!config.redirectUri) {
			throw new Error("Redirect URI is required");
		}

		if (!config.scopes || config.scopes.length === 0) {
			throw new Error("At least one scope is required");
		}
	}

	/**
	 * Generate secure random string for PKCE or state
	 */
	protected generateRandomString(length: number = 32): string {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) =>
			byte.toString(16).padStart(2, "0")
		).join("");
	}

	/**
	 * Create OAuth2Tokens object with current timestamp
	 */
	protected createTokensResponse(tokenData: any): OAuth2Tokens {
		return {
			accessToken: tokenData.access_token,
			refreshToken: tokenData.refresh_token,
			tokenType: tokenData.token_type || "Bearer",
			expiresIn: tokenData.expires_in || 3600,
			scope: tokenData.scope,
			issuedAt: Date.now(),
		};
	}

	/**
	 * Check if token response contains required fields
	 */
	protected validateTokenResponse(tokenData: any): void {
		if (!tokenData.access_token) {
			throw new OAuth2Error(
				"invalid_token_response",
				"Access token not found in response"
			);
		}
	}
}

/**
 * OAuth 2.0 Provider Capabilities
 */
export interface OAuth2ProviderCapabilities {
	/** Provider name */
	name: string;
	/** Whether the provider supports refresh tokens */
	supportsRefreshToken: boolean;
	/** Whether the provider supports token revocation */
	supportsTokenRevocation: boolean;
	/** Whether the provider supports token validation */
	supportsTokenValidation: boolean;
	/** Whether the provider requires client secret */
	requiresClientSecret: boolean;
	/** Whether the provider supports PKCE */
	supportsPKCE: boolean;
	/** Default scopes for this provider */
	defaultScopes: string[];
}

/**
 * OAuth 2.0 Error Response
 */
export interface OAuth2ErrorResponse {
	/** Error code */
	error: string;
	/** Error description */
	error_description?: string;
	/** Error URI with more information */
	error_uri?: string;
}

/**
 * OAuth 2.0 Error Class
 */
export class OAuth2Error extends Error {
	public readonly code: string;
	public readonly description: string;
	public readonly statusCode: number;

	constructor(code: string, description: string, statusCode: number = 0) {
		super(`OAuth2 Error: ${code} - ${description}`);
		this.name = "OAuth2Error";
		this.code = code;
		this.description = description;
		this.statusCode = statusCode;
	}

	/**
	 * Check if error is retryable
	 */
	isRetryable(): boolean {
		// Network errors and server errors are retryable
		return (
			this.code === "network_error" ||
			this.statusCode >= 500 ||
			this.statusCode === 429
		); // Rate limit
	}

	/**
	 * Check if error requires re-authentication
	 */
	requiresReauth(): boolean {
		return (
			this.code === "invalid_grant" ||
			this.code === "unauthorized_client" ||
			this.statusCode === 401
		);
	}
}
