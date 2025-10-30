/**
 * MCP Integration Settings Tab Component
 */

import { Setting, Notice, Platform, setIcon, requestUrl } from "obsidian";
import { t } from "@/translations/helper";
import TaskProgressBarPlugin from "@/index";
import { McpServerManager } from "@/mcp/McpServerManager";
import { AuthMiddleware } from "@/mcp/auth/AuthMiddleware";
import { ConfirmModal } from "@/components/ui/modals/ConfirmModal";
import "@/styles/mcp-integration.css";

function createConfigBlock(
	container: HTMLElement,
	config: any,
	label: string,
): void {
	const blockContainer = container.createDiv("mcp-config-block");

	// Create code block
	const codeBlock = blockContainer.createEl("pre", {
		cls: "mcp-config-code",
	});
	const codeEl = codeBlock.createEl("code");
	codeEl.setText(JSON.stringify(config, null, 2));

	// Code block styling handled by CSS

	// Create copy button
	const copyBtn = blockContainer.createEl("button", {
		text: t("Copy"),
		cls: "mcp-copy-btn",
	});
	// Copy button styling handled by CSS

	copyBtn.onclick = async () => {
		await navigator.clipboard.writeText(JSON.stringify(config, null, 2));
		copyBtn.setText(t("Copied!"));
		copyBtn.addClass("copied");
		setTimeout(() => {
			copyBtn.setText(t("Copy"));
			copyBtn.removeClass("copied");
		}, 2000);
	};

	// Styles are handled by CSS
}

export function renderMcpIntegrationSettingsTab(
	containerEl: HTMLElement,
	plugin: TaskProgressBarPlugin,
	applySettingsUpdate: () => void,
): void {
	// Only show on desktop
	if (!Platform.isDesktopApp) {
		containerEl.createEl("div", {
			text: t("MCP integration is only available on desktop"),
			cls: "setting-item-description",
		});
		return;
	}

	const mcpManager = (plugin as TaskProgressBarPlugin).mcpServerManager as
		| McpServerManager
		| undefined;

	// Server Status Section
	containerEl.createEl("h3", { text: t("MCP Server Status") });

	const statusContainer = containerEl.createDiv("mcp-status-container");
	updateServerStatus(statusContainer, mcpManager);

	// Enable/Disable Toggle
	new Setting(containerEl)
		.setName(t("Enable MCP Server"))
		.setDesc(t("Start the MCP server to allow external tool connections"))
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.mcpIntegration?.enabled || false)
				.onChange(async (value) => {
					// Show confirmation dialog when enabling MCP
					if (value) {
						const modal = new ConfirmModal(plugin, {
							title: t("Enable MCP Server"),
							message: t(
								"WARNING: Enabling the MCP server will allow external AI tools and applications to access and modify your task data. This includes:\n\n• Reading all tasks and their details\n• Creating new tasks\n• Updating existing tasks\n• Deleting tasks\n• Accessing task metadata and properties\n\nOnly enable this if you trust the applications that will connect to the MCP server. Make sure to keep your authentication token secure.\n\nDo you want to continue?",
							),
							confirmText: t("Enable MCP Server"),
							cancelText: t("Cancel"),
							onConfirm: async (confirmed) => {
								if (confirmed) {
									// User confirmed, proceed with enabling
									if (!plugin.settings.mcpIntegration) {
										plugin.settings.mcpIntegration = {
											enabled: true,
											port: 7777,
											host: "127.0.0.1",
											authToken:
												AuthMiddleware.generateToken(),
											enableCors: true,
											logLevel: "info",
										};
									} else {
										plugin.settings.mcpIntegration.enabled = true;
									}

									await plugin.saveSettings();

									if (mcpManager) {
										await mcpManager.updateConfig({
											enabled: true,
										});
										updateServerStatus(
											statusContainer,
											mcpManager,
										);
									}

									toggle.setValue(true);
									new Notice(
										t(
											"MCP Server enabled. Keep your authentication token secure!",
										),
									);
								} else {
									// User cancelled, revert toggle
									toggle.setValue(false);
								}
							},
						});
						modal.open();
					} else {
						// Disabling doesn't need confirmation
						if (plugin.settings.mcpIntegration) {
							plugin.settings.mcpIntegration.enabled = false;
						}

						await plugin.saveSettings();

						if (mcpManager) {
							await mcpManager.updateConfig({ enabled: false });
							updateServerStatus(statusContainer, mcpManager);
						}
					}
				});
		});

	if (!plugin.settings.mcpIntegration?.enabled) {
		return;
	}
	// Server Configuration
	containerEl.createEl("h3", { text: t("Server Configuration") });

	// Host Setting
	new Setting(containerEl)
		.setName(t("Host"))
		.setDesc(
			t(
				"Server host address. Use 127.0.0.1 for local only, 0.0.0.0 for all interfaces",
			),
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption("127.0.0.1", "127.0.0.1 (Local only)")
				.addOption(
					"0.0.0.0",
					"0.0.0.0 (All interfaces - for external access)",
				)
				.setValue(plugin.settings.mcpIntegration?.host || "127.0.0.1")
				.onChange(async (value) => {
					if (!plugin.settings.mcpIntegration) return;

					// If switching to 0.0.0.0, show confirmation dialog
					if (
						value === "0.0.0.0" &&
						plugin.settings.mcpIntegration.host !== "0.0.0.0"
					) {
						const modal = new ConfirmModal(plugin, {
							title: t("Security Warning"),
							message: t(
								"⚠️ **WARNING**: Switching to 0.0.0.0 will make the MCP server accessible from external networks.\n\nThis could expose your Obsidian data to:\n- Other devices on your local network\n- Potentially the internet if your firewall is misconfigured\n\n**Only proceed if you:**\n- Understand the security implications\n- Have properly configured your firewall\n- Need external access for legitimate reasons\n\nAre you sure you want to continue?",
							),
							confirmText: t("Yes, I understand the risks"),
							cancelText: t("Cancel"),
							onConfirm: async (confirmed) => {
								if (confirmed) {
									if (plugin.settings.mcpIntegration) {
										plugin.settings.mcpIntegration.host =
											value;
										applySettingsUpdate();
									}
									new Notice(
										t(
											"Host changed to 0.0.0.0. Server is now accessible from external networks.",
										),
									);
								} else {
									// Revert dropdown to previous value
									dropdown.setValue(
										plugin.settings.mcpIntegration?.host ||
											"127.0.0.1",
									);
								}
							},
						});
						modal.open();
					} else {
						// Direct update for switching to 127.0.0.1 or no change
						plugin.settings.mcpIntegration.host = value;
						applySettingsUpdate();
					}
				});
		});

	// Port Setting
	new Setting(containerEl)
		.setName(t("Port"))
		.setDesc(t("Server port number (default: 7777)"))
		.addText((text) => {
			text.setPlaceholder("7777")
				.setValue(String(plugin.settings.mcpIntegration?.port || 7777))
				.onChange(async (value) => {
					if (!plugin.settings.mcpIntegration) return;
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port < 65536) {
						plugin.settings.mcpIntegration.port = port;
						applySettingsUpdate();
					}
				});
		});

	// Authentication Section
	containerEl.createEl("h3", { text: t("Authentication") });

	// Auth Token Display
	const authTokenSetting = new Setting(containerEl)
		.setName(t("Authentication Token"))
		.setDesc(
			t(
				"Bearer token for authenticating MCP requests (keep this secret)",
			),
		);

	const tokenInput = authTokenSetting.controlEl.createEl("input", {
		type: "password",
		value: plugin.settings.mcpIntegration?.authToken || "",
		cls: "mcp-token-input",
	});

	tokenInput.readOnly = true;

	// Show/Hide Token Button
	authTokenSetting.addButton((button) => {
		button.setButtonText(t("Show")).onClick(() => {
			if (tokenInput.type === "password") {
				tokenInput.type = "text";
				button.setButtonText(t("Hide"));
			} else {
				tokenInput.type = "password";
				button.setButtonText(t("Show"));
			}
		});
	});

	// Copy Token Button
	authTokenSetting.addButton((button) => {
		button.setButtonText(t("Copy")).onClick(async () => {
			await navigator.clipboard.writeText(tokenInput.value);
			new Notice(t("Token copied to clipboard"));
		});
	});

	// Regenerate Token Button
	authTokenSetting.addButton((button) => {
		button.setButtonText(t("Regenerate")).onClick(async () => {
			if (!plugin.settings.mcpIntegration || !mcpManager) return;

			const newToken = mcpManager.regenerateAuthToken();
			tokenInput.value = newToken;
			await plugin.saveSettings();
			new Notice(t("New token generated"));
		});
	});

	// Advanced Settings
	containerEl.createEl("h3", { text: t("Advanced Settings") });

	// CORS Setting
	new Setting(containerEl)
		.setName(t("Enable CORS"))
		.setDesc(t("Allow cross-origin requests (required for web clients)"))
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.mcpIntegration?.enableCors ?? true)
				.onChange(async (value) => {
					if (!plugin.settings.mcpIntegration) return;
					plugin.settings.mcpIntegration.enableCors = value;
					applySettingsUpdate();
				});
		});

	// Log Level Setting
	new Setting(containerEl)
		.setName(t("Log Level"))
		.setDesc(t("Logging verbosity for debugging"))
		.addDropdown((dropdown) => {
			dropdown
				.addOption("error", t("Error"))
				.addOption("warn", t("Warning"))
				.addOption("info", t("Info"))
				.addOption("debug", t("Debug"))
				.setValue(plugin.settings.mcpIntegration?.logLevel || "info")
				.onChange(async (value: any) => {
					if (!plugin.settings.mcpIntegration) return;
					plugin.settings.mcpIntegration.logLevel = value;
					applySettingsUpdate();
				});
		});

	// Server Actions
	containerEl.createEl("h3", { text: t("Server Actions") });

	const actionsContainer = containerEl.createDiv("mcp-actions-container");

	// Test Connection Button
	new Setting(actionsContainer)
		.setName(t("Test Connection"))
		.setDesc(t("Test the MCP server connection"))
		.addButton((button) => {
			button.setButtonText(t("Test")).onClick(async () => {
				button.setDisabled(true);
				button.setButtonText(t("Testing..."));

				try {
					console.log("[MCP Test] Starting connection test...");
					console.log("[MCP Test] Server URL:", serverUrl);
					console.log("[MCP Test] Auth Token:", authToken);
					console.log("[MCP Test] App ID:", appId);

					// Test 1: Basic connectivity
					console.log("[MCP Test] Test 1: Basic connectivity...");
					const healthRes = await requestUrl({
						url: `http://${plugin.settings.mcpIntegration?.host || "127.0.0.1"}:${plugin.settings.mcpIntegration?.port || 7777}/health`,
						method: "GET",
					}).catch((err) => {
						console.error("[MCP Test] Health check failed:", err);
						throw new Error(`Cannot reach server: ${err.message}`);
					});

					if (!healthRes || healthRes.status !== 200) {
						throw new Error(`Health check failed`);
					}
					console.log("[MCP Test] Health check passed");

					// Test 2: MCP initialize with Method B (combined bearer)
					console.log(
						"[MCP Test] Test 2: MCP initialize with Method B...",
					);
					const initRes = await requestUrl({
						url: serverUrl,
						method: "POST",
						headers: {
							Authorization: bearerWithAppId,
							"Content-Type": "application/json",
							Accept: "application/json, text/event-stream",
							"MCP-Protocol-Version": "2025-06-18",
						},
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: 1,
							method: "initialize",
						}),
					}).catch((err) => {
						throw new Error(`Initialize failed: ${err.message}`);
					});

					if (initRes.status !== 200) {
						const errorBody = initRes.text;
						throw new Error(
							`Initialize failed with status ${initRes.status}: ${errorBody}`,
						);
					}

					// Obsidian's requestUrl returns json directly
					const initJson = initRes.json;
					console.log("[MCP Test] Initialize response:", initJson);
					console.log("[MCP Test] Headers:", initRes.headers);

					if (initJson.error) {
						throw new Error(`MCP error: ${initJson.error.message}`);
					}

					// Obsidian's requestUrl returns headers with lowercase keys
					const sessionId =
						initRes.headers["mcp-session-id"] ||
						initRes.headers["Mcp-Session-Id"] ||
						initJson?.sessionId ||
						initJson?.result?.sessionId;

					if (!sessionId) {
						console.error("[MCP Test] No session ID in response");
						throw new Error("No session ID returned");
					}

					console.log("[MCP Test] Got session ID:", sessionId);

					// Test 3: Tools list
					console.log("[MCP Test] Test 3: Listing tools...");
					const toolsRes = await requestUrl({
						url: serverUrl,
						method: "POST",
						headers: {
							Authorization: bearerWithAppId,
							"Mcp-Session-Id": sessionId,
							"Content-Type": "application/json",
							Accept: "application/json, text/event-stream",
							"MCP-Protocol-Version": "2025-06-18",
						},
						body: JSON.stringify({
							jsonrpc: "2.0",
							id: 2,
							method: "tools/list",
						}),
					});

					// Obsidian's requestUrl returns json directly
					const toolsJson = toolsRes.json;
					console.log("[MCP Test] Tools response:", toolsJson);

					if (toolsJson.error) {
						throw new Error(
							`Tools list error: ${toolsJson.error.message}`,
						);
					}

					new Notice(
						t("Connection test successful! MCP server is working."),
					);
					console.log("[MCP Test] All tests passed!");
				} catch (error: any) {
					console.error("[MCP Test] Test failed:", error);
					new Notice(t("Connection test failed: ") + error.message);
				} finally {
					button.setDisabled(false);
					button.setButtonText(t("Test"));
				}
			});
		});

	// Restart Server Button
	new Setting(actionsContainer)
		.setName(t("Restart Server"))
		.setDesc(t("Stop and restart the MCP server"))
		.addButton((button) => {
			button
				.setButtonText(t("Restart"))
				.setCta()
				.onClick(async () => {
					if (!mcpManager) return;
					button.setDisabled(true);
					try {
						await mcpManager.restart();
						new Notice(t("MCP server restarted"));
						updateServerStatus(statusContainer, mcpManager);
					} catch (error: any) {
						new Notice(
							t("Failed to restart server: ") + error.message,
						);
					} finally {
						button.setDisabled(false);
					}
				});
		})
		// Try next available port Button
		.addButton((button) => {
			button
				.setButtonText(t("Use Next Available Port"))
				.onClick(async () => {
					if (!mcpManager || !plugin.settings.mcpIntegration) return;
					button.setDisabled(true);
					try {
						const startPort =
							(plugin.settings.mcpIntegration.port || 7777) + 1;
						let candidate = startPort;
						let found = false;
						// Probe a small range for availability by attempting to update (manager validates)
						for (let i = 0; i < 50; i++) {
							try {
								await mcpManager.updateConfig({
									port: candidate,
								});
								found = true;
								break;
							} catch {
								candidate++;
							}
						}
						if (found) {
							new Notice(
								t("Port updated to ") + String(candidate),
							);
							updateServerStatus(statusContainer, mcpManager);
						} else {
							new Notice(t("No available port found in range"));
						}
					} finally {
						button.setDisabled(false);
					}
				});
		});

	// Client Configuration
	containerEl.createEl("h3", { text: t("Client Configuration") });

	const configContainer = containerEl.createDiv("mcp-config-container");

	// Authentication Method Toggle
	let useMethodB = true; // Default to Method B

	// Forward declare update functions
	let updateClientConfigs: () => void;
	let updateExamples: () => void;

	const authMethodSetting = new Setting(configContainer)
		.setName(t("Authentication Method"))
		.setDesc(
			t("Choose the authentication method for client configurations"),
		)
		.addDropdown((dropdown) => {
			dropdown
				.addOption(
					"methodB",
					t("Method B: Combined Bearer (Recommended)"),
				)
				.addOption("methodA", t("Method A: Custom Headers"))
				.setValue("methodB")
				.onChange((value) => {
					useMethodB = value === "methodB";
					updateClientConfigs();
					if (updateExamples) updateExamples();
				});
		});

	// Generate configuration based on current settings
	// For external access, use actual IP or localhost depending on host setting
	const configHost = plugin.settings.mcpIntegration?.host || "127.0.0.1";
	const displayHost = configHost === "0.0.0.0" ? "127.0.0.1" : configHost; // Use localhost for display when binding to all interfaces
	const serverUrl = `http://${displayHost}:${plugin.settings.mcpIntegration?.port || 7777}/mcp`;

	const authToken = plugin.settings.mcpIntegration?.authToken || "";
	const vaultName = plugin.app.vault.getName();
	// Create a stable, slugified tool/server name per vault: [vault]-tasks
	const toolName = `${vaultName
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")}-tasks`;
	const appId = plugin.app.appId;
	const bearerWithAppId = `Bearer ${authToken}+${appId}`;

	// Authentication Methods Documentation
	const authMethodsContainer = configContainer.createDiv("mcp-auth-methods");
	authMethodsContainer.createEl("div", {
		text: t("Supported Authentication Methods:"),
		cls: "setting-item-description",
	});
	const authList = authMethodsContainer.createEl("ul", {
		cls: "mcp-auth-list",
	});

	// Method A
	const methodAItem = authList.createEl("li");
	methodAItem.createEl("strong", { text: "Method A (Custom Header):" });
	methodAItem.appendText(" ");
	methodAItem.createEl("code", { text: `mcp-app-id: ${appId}` });
	methodAItem.appendText(" + ");
	methodAItem.createEl("code", {
		text: `Authorization: Bearer ${authToken}`,
	});

	// Method B
	const methodBItem = authList.createEl("li");
	methodBItem.createEl("strong", { text: "Method B (Combined Bearer):" });
	methodBItem.appendText(" ");
	methodBItem.createEl("code", {
		text: `Authorization: Bearer ${authToken}+${appId}`,
	});

	// Container for client configs that will be updated dynamically
	const clientConfigsContainer = configContainer.createDiv(
		"mcp-client-configs-container",
	);

	// Function to generate client configs based on selected method
	const generateClientConfigs = () => {
		if (useMethodB) {
			// Method B: Combined Bearer Token
			return [
				{
					name: "Cursor",
					config: {
						mcpServers: {
							[toolName]: {
								url: serverUrl,
								headers: {
									Authorization: bearerWithAppId,
								},
							},
						},
					},
				},
				{
					name: "Claude Desktop",
					config: {
						mcpServers: {
							[toolName]: {
								command: "curl",
								args: [
									"-X",
									"POST",
									"-H",
									`Authorization: ${bearerWithAppId}`,
									"-H",
									"Content-Type: application/json",
									"--data-raw",
									"@-",
									serverUrl,
								],
							},
						},
					},
				},
				{
					name: "Claude Code",
					commandLine: `claude mcp add --transport http ${toolName} ${serverUrl} --header "Authorization: ${bearerWithAppId}"`,
				},
				{
					name: "VS Code",
					config: {
						mcp: {
							servers: {
								[toolName]: {
									type: "http",
									url: serverUrl,
									headers: {
										Authorization: bearerWithAppId,
									},
								},
							},
						},
					},
				},
				{
					name: "Windsurf",
					config: {
						mcpServers: {
							[toolName]: {
								serverUrl: serverUrl,
								headers: {
									Authorization: bearerWithAppId,
								},
							},
						},
					},
				},
				{
					name: "Zed",
					config: {
						context_servers: {
							[toolName]: {
								command: {
									path: "curl",
									args: [
										"-X",
										"POST",
										"-H",
										`Authorization: ${bearerWithAppId}`,
										"-H",
										"Content-Type: application/json",
										"--data-raw",
										"@-",
										serverUrl,
									],
								},
								settings: {},
							},
						},
					},
				},
			];
		} else {
			// Method A: Custom Headers
			return [
				{
					name: "Cursor",
					config: {
						mcpServers: {
							[toolName]: {
								url: serverUrl,
								headers: {
									Authorization: `Bearer ${authToken}`,
									"mcp-app-id": appId,
								},
							},
						},
					},
				},
				{
					name: "Claude Desktop",
					config: {
						mcpServers: {
							[toolName]: {
								command: "curl",
								args: [
									"-X",
									"POST",
									"-H",
									`Authorization: Bearer ${authToken}`,
									"-H",
									`mcp-app-id: ${appId}`,
									"-H",
									"Content-Type: application/json",
									"--data-raw",
									"@-",
									serverUrl,
								],
							},
						},
					},
				},
				{
					name: "Claude Code",
					commandLine: `claude mcp add --transport http ${toolName} ${serverUrl} --header "Authorization: Bearer ${authToken}" --header "mcp-app-id: ${appId}"`,
				},
				{
					name: "VS Code",
					config: {
						mcp: {
							servers: {
								[toolName]: {
									type: "http",
									url: serverUrl,
									headers: {
										Authorization: `Bearer ${authToken}`,
										"mcp-app-id": appId,
									},
								},
							},
						},
					},
				},
				{
					name: "Windsurf",
					config: {
						mcpServers: {
							[toolName]: {
								serverUrl: serverUrl,
								headers: {
									Authorization: `Bearer ${authToken}`,
									"mcp-app-id": appId,
								},
							},
						},
					},
				},
				{
					name: "Zed",
					config: {
						context_servers: {
							[toolName]: {
								command: {
									path: "curl",
									args: [
										"-X",
										"POST",
										"-H",
										`Authorization: Bearer ${authToken}`,
										"-H",
										`mcp-app-id: ${appId}`,
										"-H",
										"Content-Type: application/json",
										"--data-raw",
										"@-",
										serverUrl,
									],
								},
								settings: {},
							},
						},
					},
				},
			];
		}
	};

	// Function to update client configurations
	updateClientConfigs = () => {
		clientConfigsContainer.empty();
		const clientConfigs = generateClientConfigs();

		clientConfigs.forEach((client) => {
			const section =
				clientConfigsContainer.createDiv("mcp-client-section");

			// Create collapsible header
			const header = section.createDiv("mcp-client-header");

			const arrow = header.createDiv("mcp-arrow");
			setIcon(arrow, "chevron-right");

			header.createEl("span", {
				text: client.name,
				cls: "mcp-client-name",
			});

			const content = section.createDiv("mcp-client-content");
			// Display handled by CSS

			// Toggle collapse/expand
			let isExpanded = false;
			header.onclick = () => {
				isExpanded = !isExpanded;
				if (isExpanded) {
					content.classList.add("expanded");
					arrow.classList.add("expanded");
				} else {
					content.classList.remove("expanded");
					arrow.classList.remove("expanded");
				}
			};

			// Add configuration content
			if (client.name === "Cursor") {
				// Add one-click install for Cursor
				const cursorInstallSection = content.createDiv(
					"mcp-cursor-install-section",
				);
				cursorInstallSection.createEl("h4", {
					text: t("Quick Install"),
					cls: "mcp-docs-subtitle",
				});

				// Generate Cursor deeplink configuration
				const cursorConfig = {
					url: serverUrl,
					headers: {
						Authorization: bearerWithAppId,
					},
				};

				// Base64 encode the configuration
				const encodedConfig = btoa(JSON.stringify(cursorConfig));
				const cursorDeeplink = `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(toolName)}&config=${encodedConfig}`;

				// Create install button container
				const installContainer = cursorInstallSection.createDiv(
					"mcp-cursor-install-container",
				);

				// Add description
				installContainer.createEl("p", {
					text: t(
						"Click the button below to automatically add this MCP server to Cursor:",
					),
					cls: "mcp-cursor-install-desc",
				});

				// Create install button with official Cursor SVG (dark mode style)
				const installLink = installContainer.createEl("a", {
					href: cursorDeeplink,
					cls: "mcp-cursor-install-link",
				});

				const installBtn = installLink.createEl("img", {
					attr: {
						src: "https://cursor.com/deeplink/mcp-install-dark.svg",
						alt: `Add ${toolName} MCP server to Cursor`,
						height: "32",
					},
				});

				// Additional buttons container
				const additionalButtons = installContainer.createDiv(
					"mcp-cursor-additional-buttons",
				);

				// Copy deeplink button
				const copyDeeplinkBtn = additionalButtons.createEl("button", {
					text: t("Copy Install Link"),
					cls: "mcp-cursor-copy-deeplink-btn",
				});

				copyDeeplinkBtn.onclick = async () => {
					await navigator.clipboard.writeText(cursorDeeplink);
					copyDeeplinkBtn.setText(t("Copied!"));
					copyDeeplinkBtn.addClass("copied");
					setTimeout(() => {
						copyDeeplinkBtn.setText(t("Copy Install Link"));
						copyDeeplinkBtn.removeClass("copied");
					}, 2000);
				};

				// Add separator
				content.createEl("hr", {
					cls: "mcp-section-separator",
				});

				// Add manual configuration section
				content.createEl("h4", {
					text: t("Manual Configuration"),
					cls: "mcp-docs-subtitle",
				});

				// Show the configuration JSON
				createConfigBlock(
					content,
					client.config,
					`${client.name} configuration`,
				);
			} else if (client.config) {
				createConfigBlock(
					content,
					client.config,
					`${client.name} configuration`,
				);
			} else if (client.commandLine) {
				// Special handling for command line configs
				const cmdBlock = content.createDiv("mcp-config-block");
				const codeBlock = cmdBlock.createEl("pre", {
					cls: "mcp-config-code",
				});
				const codeEl = codeBlock.createEl("code");
				codeEl.setText(client.commandLine);

				// Code block styling handled by CSS

				// Create copy button
				const copyBtn = cmdBlock.createEl("button", {
					text: t("Copy"),
					cls: "mcp-copy-btn",
				});
				copyBtn.onclick = async () => {
					await navigator.clipboard.writeText(client.commandLine!);
					copyBtn.setText(t("Copied!"));
					copyBtn.addClass("copied");
					setTimeout(() => {
						copyBtn.setText(t("Copy"));
						copyBtn.removeClass("copied");
					}, 2000);
				};

				// Styles are handled by CSS
			}
		});
	};

	// Initial render of client configs
	updateClientConfigs();

	// API Documentation
	containerEl.createEl("h3", { text: t("API Documentation") });

	const docsContainer = containerEl.createDiv("mcp-docs-container");

	// Server Endpoint Section
	const endpointSection = docsContainer.createDiv("mcp-docs-section");
	endpointSection.createEl("h4", {
		text: t("Server Endpoint"),
		cls: "mcp-docs-subtitle",
	});

	const endpointBox = endpointSection.createDiv("mcp-endpoint-box");
	const endpointContent = endpointBox.createDiv("mcp-endpoint-content");

	const endpointLabel = endpointContent.createSpan("mcp-endpoint-label");
	endpointLabel.setText("URL: ");

	const endpointUrl = serverUrl;
	endpointContent.createEl("code", {
		text: endpointUrl,
		cls: "mcp-endpoint-url",
	});

	// Copy endpoint button
	const copyEndpointBtn = endpointBox.createEl("button", {
		text: t("Copy URL"),
		cls: "mcp-copy-endpoint-btn",
	});
	copyEndpointBtn.onclick = async () => {
		await navigator.clipboard.writeText(endpointUrl);
		copyEndpointBtn.setText(t("Copied!"));
		copyEndpointBtn.addClass("copied");
		setTimeout(() => {
			copyEndpointBtn.setText(t("Copy URL"));
			copyEndpointBtn.removeClass("copied");
		}, 2000);
	};

	// Available Tools Section
	const toolsSection = docsContainer.createDiv("mcp-docs-section");
	toolsSection.createEl("h4", {
		text: t("Available Tools"),
		cls: "mcp-docs-subtitle",
	});

	const toolsGrid = toolsSection.createDiv("mcp-tools-grid");
	const toolsInfo = toolsSection.createDiv("mcp-tools-info");
	toolsInfo.setText(t("Loading tools...") as string);

	async function renderDynamicTools() {
		try {
			// Step 1: initialize to get session id
			const initRes = await requestUrl({
				url: serverUrl,
				method: "POST",
				headers: {
					Authorization: `${bearerWithAppId}`,
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					"MCP-Protocol-Version": "2025-06-18",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
				}),
			});

			// Session ID should be in the Mcp-Session-Id header according to spec
			// Obsidian's requestUrl returns headers with lowercase keys
			const sessionId =
				initRes.headers["mcp-session-id"] ||
				initRes.headers["Mcp-Session-Id"]; // Fallback for case variations

			if (!sessionId) {
				throw new Error("No session id returned");
			}

			// Step 2: list tools
			const listRes = await requestUrl({
				url: serverUrl,
				method: "POST",
				headers: {
					Authorization: `${bearerWithAppId}`,
					"Mcp-Session-Id": sessionId,
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
					"MCP-Protocol-Version": "2025-06-18",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
				}),
			});

			console.log("MCP tools", listRes);

			const tools = listRes?.json.result?.tools || [];

			toolsInfo.setText("");
			if (!tools.length) {
				toolsInfo.setText(t("No tools available") as string);
				return;
			}

			tools.forEach((tool: any) => {
				const toolCard = toolsGrid.createDiv("mcp-tool-card");
				const toolHeader = toolCard.createDiv("mcp-tool-header");
				const iconEl = toolHeader.createDiv("mcp-tool-icon");
				setIcon(iconEl, "wrench");
				toolHeader.createEl("code", {
					text: tool.name,
					cls: "mcp-tool-name",
				});
				const toolDesc = toolCard.createDiv("mcp-tool-desc");
				toolDesc.setText(tool.description || "");
			});
		} catch (e: any) {
			console.error("[MCP Tools] Failed to load tools:", e);
			toolsInfo.setText(
				t("Failed to load tools. Is the MCP server running?") as string,
			);
		}
	}

	// Fire and forget; UI remains responsive
	renderDynamicTools();

	// Example Request Section
	const exampleSection = docsContainer.createDiv("mcp-docs-section");
	exampleSection.createEl("h4", {
		text: t("Example Request"),
		cls: "mcp-docs-subtitle",
	});

	const exampleContainer = exampleSection.createDiv("mcp-example-container");

	// Function to update examples based on selected authentication method
	updateExamples = () => {
		exampleContainer.empty();
		renderExamples();
	};

	const renderExamples = () => {
		// Tab buttons for different examples
		const tabContainer = exampleContainer.createDiv("mcp-example-tabs");
		const curlTab = tabContainer.createEl("button", {
			text: "cURL",
			cls: "mcp-example-tab active",
		});
		const jsTab = tabContainer.createEl("button", {
			text: "JavaScript",
			cls: "mcp-example-tab",
		});
		const pythonTab = tabContainer.createEl("button", {
			text: "Python",
			cls: "mcp-example-tab",
		});

		// Example code blocks
		const exampleCodeContainer = exampleContainer.createDiv(
			"mcp-example-code-container",
		);

		// cURL example
		const curlExample = exampleCodeContainer.createDiv(
			"mcp-example-block active",
		);
		curlExample.createEl("div", {
			text: "1) Initialize",
			cls: "mcp-example-subtitle",
		});
		const curlPreInit = curlExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			curlPreInit.createEl("code", {
				text: `curl -i -X POST ${endpointUrl} \\
  -H "Authorization: ${bearerWithAppId}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'`,
			});
		} else {
			curlPreInit.createEl("code", {
				text: `curl -i -X POST ${endpointUrl} \\
  -H "Authorization: Bearer ${authToken}" \\
  -H "mcp-app-id: ${appId}" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'`,
			});
		}

		curlExample.createEl("div", {
			text: "2) Call tool with session id",
			cls: "mcp-example-subtitle",
		});
		const curlPreCall = curlExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			curlPreCall.createEl("code", {
				text: `curl -X POST ${endpointUrl} \\
  -H "Authorization: ${bearerWithAppId}" \\
  -H "mcp-session-id: REPLACE_WITH_SESSION_ID" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_tasks","arguments":{"filter":{"completed":false,"priority":5},"limit":10}}}'`,
			});
		} else {
			curlPreCall.createEl("code", {
				text: `curl -X POST ${endpointUrl} \\
  -H "Authorization: Bearer ${authToken}" \\
  -H "mcp-app-id: ${appId}" \\
  -H "mcp-session-id: REPLACE_WITH_SESSION_ID" \\
  -H "Content-Type: application/json" \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"query_tasks","arguments":{"filter":{"completed":false,"priority":5},"limit":10}}}'`,
			});
		}

		// JavaScript example (Init + Call)
		const jsExample = exampleCodeContainer.createDiv("mcp-example-block");
		jsExample.createEl("div", {
			text: "1) Initialize",
			cls: "mcp-example-subtitle",
		});
		const jsPreInit = jsExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			jsPreInit.createEl("code", {
				text: `const initRes = await fetch('${endpointUrl}', {\n  method: 'POST',\n  headers: {\n    'Authorization': '${bearerWithAppId}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })\n});\nconst sessionId = initRes.headers.get('mcp-session-id');`,
			});
		} else {
			jsPreInit.createEl("code", {
				text: `const initRes = await fetch('${endpointUrl}', {\n  method: 'POST',\n  headers: {\n    'Authorization': 'Bearer ${authToken}',\n    'mcp-app-id': '${appId}',\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })\n});\nconst sessionId = initRes.headers.get('mcp-session-id');`,
			});
		}

		jsExample.createEl("div", {
			text: "2) Call tool with session id",
			cls: "mcp-example-subtitle",
		});
		const jsPreCall = jsExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			jsPreCall.createEl("code", {
				text: `const callRes = await fetch('${endpointUrl}', {\n  method: 'POST',\n  headers: {\n    'Authorization': '${bearerWithAppId}',\n    'mcp-session-id': sessionId,\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    jsonrpc: '2.0',\n    id: 2,\n    method: 'tools/call',\n    params: { name: 'query_tasks', arguments: { filter: { completed: false, priority: 5 }, limit: 10 } }\n  })\n});\nconsole.log(await callRes.json());`,
			});
		} else {
			jsPreCall.createEl("code", {
				text: `const callRes = await fetch('${endpointUrl}', {\n  method: 'POST',\n  headers: {\n    'Authorization': 'Bearer ${authToken}',\n    'mcp-app-id': '${appId}',\n    'mcp-session-id': sessionId,\n    'Content-Type': 'application/json'\n  },\n  body: JSON.stringify({\n    jsonrpc: '2.0',\n    id: 2,\n    method: 'tools/call',\n    params: { name: 'query_tasks', arguments: { filter: { completed: false, priority: 5 }, limit: 10 } }\n  })\n});\nconsole.log(await callRes.json());`,
			});
		}

		// Python example (Init + Call)
		const pythonExample =
			exampleCodeContainer.createDiv("mcp-example-block");
		pythonExample.createEl("div", {
			text: "1) Initialize",
			cls: "mcp-example-subtitle",
		});
		const pythonPreInit = pythonExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			pythonPreInit.createEl("code", {
				text: `import requests

# Initialize session
init_res = requests.post(
    '${endpointUrl}',
    headers={
        'Authorization': '${bearerWithAppId}',
        'Content-Type': 'application/json'
    },
    json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'}
)
session_id = init_res.headers.get('mcp-session-id')
print(f"Session ID: {session_id}")`,
			});
		} else {
			pythonPreInit.createEl("code", {
				text: `import requests

# Initialize session
init_res = requests.post(
    '${endpointUrl}',
    headers={
        'Authorization': 'Bearer ${authToken}',
        'mcp-app-id': '${appId}',
        'Content-Type': 'application/json'
    },
    json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize'}
)
session_id = init_res.headers.get('mcp-session-id')
print(f"Session ID: {session_id}")`,
			});
		}

		pythonExample.createEl("div", {
			text: "2) Call tool with session id",
			cls: "mcp-example-subtitle",
		});
		const pythonPreCall = pythonExample.createEl("pre", {
			cls: "mcp-example-code",
		});

		if (useMethodB) {
			pythonPreCall.createEl("code", {
				text: `# Call tool
call_res = requests.post(
    '${endpointUrl}',
    headers={
        'Authorization': '${bearerWithAppId}',
        'mcp-session-id': session_id,
        'Content-Type': 'application/json'
    },
    json={
        'jsonrpc': '2.0',
        'id': 2,
        'method': 'tools/call',
        'params': {
            'name': 'query_tasks',
            'arguments': {
                'filter': {'completed': False, 'priority': 5},
                'limit': 10
            }
        }
    }
)
print(call_res.json())`,
			});
		} else {
			pythonPreCall.createEl("code", {
				text: `# Call tool
call_res = requests.post(
    '${endpointUrl}',
    headers={
        'Authorization': 'Bearer ${authToken}',
        'mcp-app-id': '${appId}',
        'mcp-session-id': session_id,
        'Content-Type': 'application/json'
    },
    json={
        'jsonrpc': '2.0',
        'id': 2,
        'method': 'tools/call',
        'params': {
            'name': 'query_tasks',
            'arguments': {
                'filter': {'completed': False, 'priority': 5},
                'limit': 10
            }
        }
    }
)
print(call_res.json())`,
			});
		}

		// Tab switching logic
		const tabs = [curlTab, jsTab, pythonTab];
		const examples = [curlExample, jsExample, pythonExample];

		tabs.forEach((tab, index) => {
			tab.onclick = () => {
				tabs.forEach((t) => t.removeClass("active"));
				examples.forEach((e) => e.removeClass("active"));
				tab.addClass("active");
				examples[index].addClass("active");
			};
		});

		// Add copy button for each code block
		examples.forEach((example) => {
			const codeBlocks = example.querySelectorAll("pre.mcp-example-code");
			codeBlocks.forEach((preBlock) => {
				const codeElement = preBlock.querySelector("code");
				if (!codeElement) return;

				const copyBtn = preBlock.createEl("button", {
					text: t("Copy"),
					cls: "mcp-example-copy-btn",
				});
				copyBtn.onclick = async () => {
					const code = codeElement.textContent || "";
					await navigator.clipboard.writeText(code);
					copyBtn.setText(t("Copied!"));
					copyBtn.addClass("copied");
					setTimeout(() => {
						copyBtn.setText(t("Copy"));
						copyBtn.removeClass("copied");
					}, 2000);
				};
			});
		});
	};

	// Initial render of examples
	renderExamples();
}

function updateServerStatus(
	container: HTMLElement,
	mcpManager?: McpServerManager,
): void {
	container.empty();

	if (!mcpManager) {
		container.createEl("div", {
			text: t("MCP Server not initialized"),
			cls: "mcp-status-error",
		});
		return;
	}

	const status = mcpManager.getStatus();
	const statusEl = container.createDiv("mcp-status");

	// Status Indicator
	const indicatorEl = statusEl.createDiv("mcp-status-indicator");
	indicatorEl.addClass(status.running ? "running" : "stopped");
	indicatorEl.createSpan({
		text: status.running ? "●" : "○",
		cls: "status-dot",
	});
	indicatorEl.createSpan({
		text: status.running ? t("Running") : t("Stopped"),
		cls: "status-text",
	});

	// Status Details
	if (status.running && status.port) {
		const detailsEl = statusEl.createDiv("mcp-status-details");
		detailsEl.createEl("div", {
			text: `${t("Port")}: ${status.port}`,
		});

		if (status.startTime) {
			const uptime = Date.now() - status.startTime.getTime();
			const hours = Math.floor(uptime / 3600000);
			const minutes = Math.floor((uptime % 3600000) / 60000);
			detailsEl.createEl("div", {
				text: `${t("Uptime")}: ${hours}h ${minutes}m`,
			});
		}

		if (status.requestCount !== undefined) {
			detailsEl.createEl("div", {
				text: `${t("Requests")}: ${status.requestCount}`,
			});
		}
	}
}
