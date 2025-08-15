/**
 * Authentication Middleware for MCP Server
 */

import { IncomingMessage, ServerResponse } from "http";

export class AuthMiddleware {
	constructor(private authToken: string) {}

	/**
	 * Validate Bearer token from request headers
	 */
	validateRequest(req: IncomingMessage): boolean {
		const authHeader = req.headers.authorization;
		if (!authHeader) {
			return false;
		}
		const parsed = AuthMiddleware.parseAuthHeader(authHeader);
		if (!parsed) {
			return false;
		}
		return parsed.token === this.authToken;
	}

	/**
	 * Parse Authorization header. Supports:
	 * - Bearer <token>
	 * - Bearer <token>+<appid>
	 */
	static parseAuthHeader(authHeader: string): { token: string; appId?: string } | null {
		const parts = authHeader.split(" ");
		if (parts.length !== 2 || parts[0] !== "Bearer") {
			return null;
		}
		const bearerVal = parts[1];
		const plusIdx = bearerVal.indexOf("+");
		if (plusIdx === -1) {
			return { token: bearerVal };
		}
		const token = bearerVal.substring(0, plusIdx);
		const appId = bearerVal.substring(plusIdx + 1) || undefined;
		return { token, appId };
	}

	/**
	 * Resolve client appId from headers: prefer mcp-app-id header, fallback to Authorization Bearer suffix
	 */
	getClientAppId(req: IncomingMessage): string | undefined {
		const headerAppId = req.headers["mcp-app-id"] as string;
		if (headerAppId) return headerAppId;
		const authHeader = req.headers.authorization;
		if (!authHeader) return undefined;
		const parsed = AuthMiddleware.parseAuthHeader(authHeader);
		return parsed?.appId;
	}

	/**
	 * Handle unauthorized response
	 */
	handleUnauthorized(res: ServerResponse): void {
		res.statusCode = 401;
		res.setHeader("Content-Type", "application/json");
		res.setHeader("WWW-Authenticate", 'Bearer realm="MCP Server"');
		res.end(
			JSON.stringify({
				error: "Unauthorized",
				message: "Invalid or missing authentication token",
			})
		);
	}

	/**
	 * Middleware function for HTTP requests
	 */
	middleware(
		req: IncomingMessage,
		res: ServerResponse,
		next: () => void
	): void {
		// Skip auth for health check endpoint
		const url = req.url || "";
		if (url === "/health" || url === "/") {
			next();
			return;
		}

		if (!this.validateRequest(req)) {
			this.handleUnauthorized(res);
			return;
		}

		next();
	}

	/**
	 * Update the authentication token
	 */
	updateToken(newToken: string): void {
		this.authToken = newToken;
	}

	/**
	 * Generate a random token
	 */
	static generateToken(): string {
		const chars =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let token = "";
		for (let i = 0; i < 32; i++) {
			token += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return token;
	}
}