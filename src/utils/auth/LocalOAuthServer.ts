/**
 * Local OAuth Server
 * Creates a temporary local HTTP server to handle OAuth callbacks
 * This is required for Google OAuth compliance
 */

import { Notice } from "obsidian";

export class LocalOAuthServer {
	private server: any = null;
	private port: number = 8080;
	private isRunning: boolean = false;
	private onCallback: ((params: Record<string, string>) => void) | null =
		null;

	/**
	 * Start the local OAuth server
	 */
	async start(
		onCallback: (params: Record<string, string>) => void
	): Promise<string> {
		if (this.isRunning) {
			throw new Error("OAuth server is already running");
		}

		this.onCallback = onCallback;

		try {
			// For Obsidian desktop, we need to use a different approach
			// Since we can't import Node.js modules directly, we'll use a workaround
			if (this.isDesktop()) {
				return this.startDesktopServer();
			} else {
				// For mobile, we'll use a different approach
				return this.startMobileServer();
			}
		} catch (error) {
			console.error("Failed to start OAuth server:", error);
			throw new Error("Failed to start local OAuth server");
		}
	}

	/**
	 * Stop the OAuth server
	 */
	async stop(): Promise<void> {
		if (!this.isRunning || !this.server) {
			return;
		}

		try {
			if (this.server.close) {
				this.server.close();
			}
			this.server = null;
			this.isRunning = false;
			this.onCallback = null;
			console.log("OAuth server stopped");
		} catch (error) {
			console.error("Error stopping OAuth server:", error);
		}
	}

	/**
	 * Get the callback URL for OAuth
	 */
	getCallbackUrl(): string {
		return `http://localhost:${this.port}/oauth/callback`;
	}

	/**
	 * Start server for desktop Obsidian
	 */
	private async startDesktopServer(): Promise<string> {
		try {
			// Use Electron's built-in capabilities
			const { ipcRenderer } = require("electron");

			// Request the main process to start a local server
			const serverUrl = await ipcRenderer.invoke("start-oauth-server", {
				port: this.port,
				callback: this.handleOAuthCallback.bind(this),
			});

			this.isRunning = true;
			return serverUrl;
		} catch (error) {
			// Fallback: Use a simple approach with window.open and manual code entry
			return this.startFallbackServer();
		}
	}

	/**
	 * Start server for mobile Obsidian
	 */
	private async startMobileServer(): Promise<string> {
		// Mobile doesn't support local servers, use fallback
		return this.startFallbackServer();
	}

	/**
	 * Fallback server implementation
	 */
	private async startFallbackServer(): Promise<string> {
		// Create a simple polling mechanism
		this.isRunning = true;

		// Show instructions to user
		new Notice(
			"After completing Google authentication, you'll be redirected to a page showing an authorization code. Copy that code and paste it in the next dialog.",
			10000
		);

		// Use a different redirect URI that shows the code
		return "urn:ietf:wg:oauth:2.0:oob";
	}

	/**
	 * Handle OAuth callback
	 */
	private handleOAuthCallback(params: Record<string, string>): void {
		if (this.onCallback) {
			this.onCallback(params);
		}
	}

	/**
	 * Check if running on desktop
	 */
	private isDesktop(): boolean {
		return (window as any).require !== undefined;
	}

	/**
	 * Manual code entry for fallback
	 */
	async promptForAuthCode(): Promise<string> {
		return new Promise((resolve, reject) => {
			// Create a simple input dialog
			const modal = document.createElement("div");
			modal.style.cssText = `
				position: fixed;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 8px;
				padding: 20px;
				z-index: 1000;
				min-width: 400px;
			`;

			modal.innerHTML = `
				<h3>Enter Authorization Code</h3>
				<p>Please paste the authorization code from Google:</p>
				<input type="text" id="auth-code-input" style="width: 100%; padding: 8px; margin: 10px 0;" placeholder="Paste authorization code here">
				<div style="text-align: right; margin-top: 15px;">
					<button id="auth-code-cancel" style="margin-right: 10px;">Cancel</button>
					<button id="auth-code-submit">Submit</button>
				</div>
			`;

			document.body.appendChild(modal);

			const input = modal.querySelector(
				"#auth-code-input"
			) as HTMLInputElement;
			const submitBtn = modal.querySelector(
				"#auth-code-submit"
			) as HTMLButtonElement;
			const cancelBtn = modal.querySelector(
				"#auth-code-cancel"
			) as HTMLButtonElement;

			const cleanup = () => {
				document.body.removeChild(modal);
			};

			submitBtn.onclick = () => {
				const code = input.value.trim();
				if (code) {
					cleanup();
					resolve(code);
				} else {
					new Notice("Please enter the authorization code");
				}
			};

			cancelBtn.onclick = () => {
				cleanup();
				reject(new Error("Authentication cancelled"));
			};

			input.focus();
		});
	}
}
