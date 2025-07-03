/**
 * Google OAuth 2.0 Provider
 * Implements OAuth 2.0 authentication for Google Calendar API
 */

import { OAuth2Provider, OAuth2Error } from "./OAuth2Provider";
import { OAuth2Config, OAuth2Tokens } from "../../types/cloud-calendar";

export class GoogleOAuth2Provider extends OAuth2Provider {
	readonly name = "google";
	readonly authUrl = "https://accounts.google.com/o/oauth2/v2/auth";
	readonly tokenUrl = "https://oauth2.googleapis.com/token";
	readonly revokeUrl = "https://oauth2.googleapis.com/revoke";
	readonly userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";

	readonly defaultScopes = [
		"https://www.googleapis.com/auth/calendar.readonly",
		"https://www.googleapis.com/auth/userinfo.email",
	];

	/**
	 * Build Google OAuth authorization URL
	 */
	buildAuthUrl(config: OAuth2Config): string {
		this.validateConfig(config);

		const params = {
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			scope: config.scopes.join(" "),
			response_type: "code",
			access_type: "offline", // Required for refresh token
			prompt: "consent", // Force consent to get refresh token
			include_granted_scopes: "true", // Include previously granted scopes
		};

		const queryString = this.buildQueryString(params);
		return `${this.authUrl}?${queryString}`;
	}

	/**
	 * Exchange authorization code for tokens
	 */
	async exchangeCodeForTokens(
		code: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		this.validateConfig(config);

		const requestBody = {
			client_id: config.clientId,
			client_secret: config.clientSecret || "",
			code: code,
			grant_type: "authorization_code",
			redirect_uri: config.redirectUri,
		};

		const tokenData = await this.makeRequest({
			url: this.tokenUrl,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: this.buildQueryString(requestBody),
		});

		this.validateTokenResponse(tokenData);
		return this.createTokensResponse(tokenData);
	}

	/**
	 * Refresh access token using refresh token
	 */
	async refreshAccessToken(
		refreshToken: string,
		config: OAuth2Config
	): Promise<OAuth2Tokens> {
		if (!refreshToken) {
			throw new OAuth2Error(
				"invalid_request",
				"Refresh token is required"
			);
		}

		const requestBody = {
			client_id: config.clientId,
			client_secret: config.clientSecret || "",
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		};

		const tokenData = await this.makeRequest({
			url: this.tokenUrl,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: this.buildQueryString(requestBody),
		});

		this.validateTokenResponse(tokenData);

		// Google doesn't always return a new refresh token
		// Keep the original refresh token if not provided
		if (!tokenData.refresh_token) {
			tokenData.refresh_token = refreshToken;
		}

		return this.createTokensResponse(tokenData);
	}

	/**
	 * Validate access token by making a test API call
	 */
	async validateToken(accessToken: string): Promise<boolean> {
		if (!accessToken) {
			return false;
		}

		try {
			await this.makeRequest({
				url: this.userInfoUrl,
				method: "GET",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					Accept: "application/json",
				},
			});
			return true;
		} catch (error) {
			if (error instanceof OAuth2Error) {
				// Token is invalid if we get 401 or 403
				return error.statusCode !== 401 && error.statusCode !== 403;
			}
			return false;
		}
	}

	/**
	 * Revoke access token
	 */
	async revokeToken(token: string, config: OAuth2Config): Promise<void> {
		if (!token) {
			throw new OAuth2Error(
				"invalid_request",
				"Token is required for revocation"
			);
		}

		const params = {
			token: token,
		};

		try {
			await this.makeRequest({
				url: this.revokeUrl,
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: this.buildQueryString(params),
			});
		} catch (error) {
			// Google returns 200 even for already revoked tokens
			// Only throw if it's a network error
			if (
				error instanceof OAuth2Error &&
				error.code === "network_error"
			) {
				throw error;
			}
		}
	}

	/**
	 * Get user information using access token
	 */
	async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
		if (!accessToken) {
			throw new OAuth2Error(
				"invalid_request",
				"Access token is required"
			);
		}

		const userInfo = await this.makeRequest({
			url: this.userInfoUrl,
			method: "GET",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				Accept: "application/json",
			},
		});

		return {
			id: userInfo.id,
			email: userInfo.email,
			verified_email: userInfo.verified_email,
			name: userInfo.name,
			given_name: userInfo.given_name,
			family_name: userInfo.family_name,
			picture: userInfo.picture,
			locale: userInfo.locale,
		};
	}

	/**
	 * Get Google-specific provider capabilities
	 */
	getCapabilities() {
		return {
			...super.getCapabilities(),
			name: this.name,
			requiresClientSecret: false, // Google supports PKCE
			supportsPKCE: true,
			supportsIncrementalAuth: true,
			maxTokenLifetime: 3600, // 1 hour
			supportsOfflineAccess: true,
		};
	}

	/**
	 * Validate Google-specific configuration
	 */
	protected validateConfig(config: OAuth2Config): void {
		super.validateConfig(config);

		// Validate Google-specific requirements
		if (config.scopes.length === 0) {
			throw new Error("At least one scope is required for Google OAuth");
		}

		// Check for required scopes
		const hasCalendarScope = config.scopes.some(
			(scope) =>
				scope.includes("calendar") ||
				scope.includes("https://www.googleapis.com/auth/calendar")
		);

		if (!hasCalendarScope) {
			console.warn(
				"GoogleOAuth2Provider: No calendar scope detected. Calendar access may not work."
			);
		}
	}

	/**
	 * Build authorization URL with Google-specific parameters
	 */
	buildAuthUrlWithPKCE(config: OAuth2Config, codeChallenge?: string): string {
		this.validateConfig(config);

		const params: Record<string, string> = {
			client_id: config.clientId,
			redirect_uri: config.redirectUri,
			scope: config.scopes.join(" "),
			response_type: "code",
			access_type: "offline",
			prompt: "consent",
			include_granted_scopes: "true",
		};

		// Add PKCE parameters if provided
		if (codeChallenge) {
			params.code_challenge = codeChallenge;
			params.code_challenge_method = "S256";
		}

		const queryString = this.buildQueryString(params);
		return `${this.authUrl}?${queryString}`;
	}

	/**
	 * Exchange code for tokens with PKCE
	 */
	async exchangeCodeForTokensWithPKCE(
		code: string,
		config: OAuth2Config,
		codeVerifier?: string
	): Promise<OAuth2Tokens> {
		this.validateConfig(config);

		const requestBody: Record<string, string> = {
			client_id: config.clientId,
			code: code,
			grant_type: "authorization_code",
			redirect_uri: config.redirectUri,
		};

		// Add PKCE verifier if provided
		if (codeVerifier) {
			requestBody.code_verifier = codeVerifier;
		} else if (config.clientSecret) {
			requestBody.client_secret = config.clientSecret;
		}

		const tokenData = await this.makeRequest({
			url: this.tokenUrl,
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: this.buildQueryString(requestBody),
		});

		this.validateTokenResponse(tokenData);
		return this.createTokensResponse(tokenData);
	}
}

/**
 * Google User Information
 */
export interface GoogleUserInfo {
	/** User ID */
	id: string;
	/** Email address */
	email: string;
	/** Whether email is verified */
	verified_email: boolean;
	/** Full name */
	name: string;
	/** Given name */
	given_name: string;
	/** Family name */
	family_name: string;
	/** Profile picture URL */
	picture: string;
	/** Locale */
	locale: string;
}
