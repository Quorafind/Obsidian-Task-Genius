import { App, Modal, Setting } from "obsidian";
import { TaskProgressBarSettingTab } from "../../setting";
import { t } from "../../translations/helper";
import TaskProgressBarPlugin from "../../index";

export function renderProjectSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("Enhanced Project Configuration"))
		.setDesc(
			t("Configure advanced project detection and management features")
		)
		.setHeading();

	new Setting(containerEl)
		.setName(t("Enable enhanced project features"))
		.setDesc(
			t(
				"Enable path-based, metadata-based, and config file-based project detection"
			)
		)
		.addToggle((toggle) => {
			toggle
				.setValue(
					settingTab.plugin.settings.projectConfig
						?.enableEnhancedProject || false
				)
				.onChange(async (value) => {
					if (!settingTab.plugin.settings.projectConfig) {
						settingTab.plugin.settings.projectConfig = {
							enableEnhancedProject: false,
							pathMappings: [],
							metadataConfig: {
								metadataKey: "project",
								
								
								enabled: false,
							},
							configFile: {
								fileName: "project.md",
								searchRecursively: true,
								enabled: false,
							},
							metadataMappings: [],
							defaultProjectNaming: {
								strategy: "filename",
								stripExtension: true,
								enabled: false,
							},
						};
					}
					settingTab.plugin.settings.projectConfig.enableEnhancedProject =
						value;
					settingTab.applySettingsUpdate();
					setTimeout(() => {
						settingTab.display();
					}, 200);
				});
		});

	if (settingTab.plugin.settings.projectConfig?.enableEnhancedProject) {
		new Setting(containerEl)
			.setName(t("Path-based Project Mappings"))
			.setDesc(t("Configure project names based on file paths"))
			.setHeading();

		const pathMappingsContainer = containerEl.createDiv({
			cls: "project-path-mappings-container",
		});

		const refreshPathMappings = () => {
			pathMappingsContainer.empty();

			// Ensure pathMappings is always an array
			if (!settingTab.plugin.settings.projectConfig) {
				settingTab.plugin.settings.projectConfig = {
					enableEnhancedProject: false,
					pathMappings: [],
					metadataConfig: {
						metadataKey: "project",
						
						
						enabled: false,
					},
					configFile: {
						fileName: "project.md",
						searchRecursively: true,
						enabled: false,
					},
					metadataMappings: [],
					defaultProjectNaming: {
						strategy: "filename",
						stripExtension: true,
						enabled: false,
					},
				};
			}

			if (
				!settingTab.plugin.settings.projectConfig.pathMappings ||
				!Array.isArray(
					settingTab.plugin.settings.projectConfig.pathMappings
				)
			) {
				settingTab.plugin.settings.projectConfig.pathMappings = [];
			}

			const pathMappings =
				settingTab.plugin.settings.projectConfig?.pathMappings || [];

			if (pathMappings.length === 0) {
				pathMappingsContainer.createDiv({
					cls: "no-mappings-message",
					text: t("No path mappings configured yet."),
				});
			}

			pathMappings.forEach((mapping, index) => {
				const mappingRow = pathMappingsContainer.createDiv({
					cls: "project-path-mapping-row",
				});

				new Setting(mappingRow)
					.setName(`${t("Mapping")} ${index + 1}`)
					.addText((text) => {
						text.setPlaceholder(
							t("Path pattern (e.g., Projects/Work)")
						)
							.setValue(mapping.pathPattern)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.pathMappings[
										index
									].pathPattern = value;
									await settingTab.plugin.saveSettings();
								}
							});
					})
					.addText((text) => {
						text.setPlaceholder(t("Project name"))
							.setValue(mapping.projectName)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.pathMappings[
										index
									].projectName = value;
									await settingTab.plugin.saveSettings();
								}
							});
					})
					.addToggle((toggle) => {
						toggle
							.setTooltip(t("Enabled"))
							.setValue(mapping.enabled)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.pathMappings[
										index
									].enabled = value;
									await settingTab.plugin.saveSettings();
								}
							});
					})
					.addButton((button) => {
						button
							.setIcon("trash")
							.setTooltip(t("Remove"))
							.onClick(async () => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.pathMappings.splice(
										index,
										1
									);
									await settingTab.plugin.saveSettings();
									refreshPathMappings();
								}
							});
					});
			});

			// Add new mapping button
			new Setting(pathMappingsContainer).addButton((button) => {
				button
					.setButtonText(t("Add Path Mapping"))
					.setCta()
					.onClick(async () => {
						// Ensure projectConfig exists
						if (!settingTab.plugin.settings.projectConfig) {
							settingTab.plugin.settings.projectConfig = {
								enableEnhancedProject: true,
								pathMappings: [],
								metadataConfig: {
									metadataKey: "project",
									
									
									enabled: false,
								},
								configFile: {
									fileName: "project.md",
									searchRecursively: true,
									enabled: false,
								},
								metadataMappings: [],
								defaultProjectNaming: {
									strategy: "filename",
									stripExtension: true,
									enabled: false,
								},
							};
						}

						// Ensure pathMappings is an array
						if (
							!Array.isArray(
								settingTab.plugin.settings.projectConfig
									.pathMappings
							)
						) {
							settingTab.plugin.settings.projectConfig.pathMappings =
								[];
						}

						// Add new mapping
						settingTab.plugin.settings.projectConfig.pathMappings.push(
							{
								pathPattern: "",
								projectName: "",
								enabled: true,
							}
						);

						await settingTab.plugin.saveSettings();
						setTimeout(() => {
							refreshPathMappings();
						}, 100);
					});
			});
		};

		refreshPathMappings();

		// Metadata-based project configuration
		new Setting(containerEl)
			.setName(t("Metadata-based Project Configuration"))
			.setDesc(t("Configure project detection from file frontmatter"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("Enable metadata project detection"))
			.setDesc(t("Detect project from file frontmatter metadata"))
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.projectConfig?.metadataConfig
							?.enabled || false
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig
								?.metadataConfig
						) {
							settingTab.plugin.settings.projectConfig.metadataConfig.enabled =
								value;
							await settingTab.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName(t("Metadata key"))
			.setDesc(t("The frontmatter key to use for project name"))
			.addText((text) => {
				text.setPlaceholder("project")
					.setValue(
						settingTab.plugin.settings.projectConfig?.metadataConfig
							?.metadataKey || "project"
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig
								?.metadataConfig
						) {
							settingTab.plugin.settings.projectConfig.metadataConfig.metadataKey =
								value || "project";
							await settingTab.plugin.saveSettings();
						}
					});
			});

		// Custom Project Detection Methods
		new Setting(containerEl)
			.setName(t("Custom Project Detection Methods"))
			.setDesc(t("Configure additional methods to detect project files"))
			.setHeading();

		const detectionMethodsContainer = containerEl.createDiv({
			cls: "project-detection-methods-container",
		});

		const refreshDetectionMethods = () => {
			detectionMethodsContainer.empty();

			// Ensure detectionMethods exists
			if (!settingTab.plugin.settings.projectConfig?.metadataConfig?.detectionMethods) {
				if (settingTab.plugin.settings.projectConfig?.metadataConfig) {
					settingTab.plugin.settings.projectConfig.metadataConfig.detectionMethods = [];
				}
			}

			const methods = settingTab.plugin.settings.projectConfig?.metadataConfig?.detectionMethods || [];

			methods.forEach((method, index) => {
				const methodDiv = detectionMethodsContainer.createDiv({
					cls: "project-detection-method",
				});

				new Setting(methodDiv)
					.setName(`${t("Method")} ${index + 1}`)
					.addDropdown((dropdown) => {
						dropdown
							.addOption("metadata", t("Metadata Property"))
							.addOption("tag", t("Tag"))
							.addOption("link", t("Linked Note"))
							.setValue(method.type)
							.onChange(async (value) => {
								method.type = value as "metadata" | "tag" | "link";
								await settingTab.plugin.saveSettings();
								refreshDetectionMethods();
							});
					})
					.addText((text) => {
						const placeholder = 
							method.type === "metadata" ? "project" :
							method.type === "tag" ? "project" :
							"category";
						text.setPlaceholder(placeholder)
							.setValue(method.propertyKey)
							.onChange(async (value) => {
								method.propertyKey = value;
								await settingTab.plugin.saveSettings();
							});
					})
					.addToggle((toggle) => {
						toggle
							.setValue(method.enabled)
							.onChange(async (value) => {
								method.enabled = value;
								await settingTab.plugin.saveSettings();
							});
					})
					.addButton((button) => {
						button
							.setIcon("trash")
							.setTooltip(t("Remove"))
							.onClick(async () => {
								methods.splice(index, 1);
								await settingTab.plugin.saveSettings();
								refreshDetectionMethods();
							});
					});

				// Add link filter field for link type
				if (method.type === "link") {
					new Setting(methodDiv)
						.setName(t("Link Filter"))
						.setDesc(t("Optional: Only match links containing this text"))
						.addText((text) => {
							text.setPlaceholder("Projects/")
								.setValue(method.linkFilter || "")
								.onChange(async (value) => {
									method.linkFilter = value;
									await settingTab.plugin.saveSettings();
								});
						});
				}
			});

			// Add new method button
			new Setting(detectionMethodsContainer)
				.addButton((button) => {
					button
						.setButtonText(t("Add Detection Method"))
						.setCta()
						.onClick(async () => {
							if (!settingTab.plugin.settings.projectConfig?.metadataConfig?.detectionMethods) {
								if (settingTab.plugin.settings.projectConfig?.metadataConfig) {
									settingTab.plugin.settings.projectConfig.metadataConfig.detectionMethods = [];
								}
							}
							settingTab.plugin.settings.projectConfig?.metadataConfig?.detectionMethods?.push({
								type: "metadata",
								propertyKey: "",
								enabled: false,
							});
							await settingTab.plugin.saveSettings();
							refreshDetectionMethods();
						});
				});
		};

		refreshDetectionMethods();

		// Project config file settings
		new Setting(containerEl)
			.setName(t("Project Configuration File"))
			.setDesc(t("Configure project detection from project config files"))
			.setHeading();

		new Setting(containerEl)
			.setName(t("Enable config file project detection"))
			.setDesc(t("Detect project from project configuration files"))
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.projectConfig?.configFile
							?.enabled || false
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig?.configFile
						) {
							settingTab.plugin.settings.projectConfig.configFile.enabled =
								value;
							await settingTab.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName(t("Config file name"))
			.setDesc(t("Name of the project configuration file"))
			.addText((text) => {
				text.setPlaceholder("project.md")
					.setValue(
						settingTab.plugin.settings.projectConfig?.configFile
							?.fileName || "project.md"
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig?.configFile
						) {
							settingTab.plugin.settings.projectConfig.configFile.fileName =
								value || "project.md";
							await settingTab.plugin.saveSettings();
						}
					});
			});

		new Setting(containerEl)
			.setName(t("Search recursively"))
			.setDesc(t("Search for config files in parent directories"))
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.projectConfig?.configFile
							?.searchRecursively ?? false
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig?.configFile
						) {
							settingTab.plugin.settings.projectConfig.configFile.searchRecursively =
								value;
							await settingTab.plugin.saveSettings();
						}
					});
			});

		// Metadata mappings section
		new Setting(containerEl)
			.setName(t("Metadata Mappings"))
			.setDesc(
				t("Configure how metadata fields are mapped and transformed")
			)
			.setHeading();

		const metadataMappingsContainer = containerEl.createDiv({
			cls: "project-metadata-mappings-container",
		});

		const refreshMetadataMappings = () => {
			metadataMappingsContainer.empty();

			// Ensure metadataMappings is always an array
			if (
				!settingTab.plugin.settings.projectConfig?.metadataMappings ||
				!Array.isArray(
					settingTab.plugin.settings.projectConfig.metadataMappings
				)
			) {
				if (settingTab.plugin.settings.projectConfig) {
					settingTab.plugin.settings.projectConfig.metadataMappings =
						[];
				}
			}

			const metadataMappings =
				settingTab.plugin.settings.projectConfig?.metadataMappings ||
				[];

			if (metadataMappings.length === 0) {
				metadataMappingsContainer.createDiv({
					cls: "no-mappings-message",
					text: t("No metadata mappings configured yet."),
				});
			}

			metadataMappings.forEach((mapping, index) => {
				const mappingRow = metadataMappingsContainer.createDiv({
					cls: "project-metadata-mapping-row",
				});

				// Get already used target keys to avoid duplicates
				const usedTargetKeys = new Set(
					metadataMappings
						.filter((_, i) => i !== index)
						.map((m) => m.targetKey)
						.filter((key) => key && key.trim() !== "")
				);

				// Available target keys from StandardTaskMetadata
				const availableTargetKeys = [
					"project",
					"context",
					"priority",
					"tags",
					"startDate",
					"scheduledDate",
					"dueDate",
					"completedDate",
					"createdDate",
					"recurrence",
				].filter(
					(key) =>
						!usedTargetKeys.has(key) || key === mapping.targetKey
				);

				new Setting(mappingRow)
					.setName(`${t("Mapping")} ${index + 1}`)
					.addText((text) => {
						text.setPlaceholder(t("Source key (e.g., proj)"))
							.setValue(mapping.sourceKey)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.metadataMappings[
										index
									].sourceKey = value;
									await settingTab.plugin.saveSettings();
								}
							});
					})
					.addDropdown((dropdown) => {
						// Add empty option
						dropdown.addOption("", t("Select target field"));

						// Add available options
						availableTargetKeys.forEach((key) => {
							dropdown.addOption(key, key);
						});

						dropdown
							.setValue(mapping.targetKey)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.metadataMappings[
										index
									].targetKey = value;
									await settingTab.plugin.saveSettings();
									// Refresh to update available options for other dropdowns
									refreshMetadataMappings();
								}
							});
					})
					.addToggle((toggle) => {
						toggle
							.setTooltip(t("Enabled"))
							.setValue(mapping.enabled)
							.onChange(async (value) => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.metadataMappings[
										index
									].enabled = value;
									await settingTab.plugin.saveSettings();
								}
							});
					})
					.addButton((button) => {
						button
							.setIcon("trash")
							.setTooltip(t("Remove"))
							.onClick(async () => {
								if (settingTab.plugin.settings.projectConfig) {
									settingTab.plugin.settings.projectConfig.metadataMappings.splice(
										index,
										1
									);
									await settingTab.plugin.saveSettings();
									refreshMetadataMappings();
								}
							});
					});
			});

			// Add new mapping button
			new Setting(metadataMappingsContainer).addButton((button) => {
				button
					.setButtonText(t("Add Metadata Mapping"))
					.setCta()
					.onClick(async () => {
						if (settingTab.plugin.settings.projectConfig) {
							if (
								!Array.isArray(
									settingTab.plugin.settings.projectConfig
										.metadataMappings
								)
							) {
								settingTab.plugin.settings.projectConfig.metadataMappings =
									[];
							}

							settingTab.plugin.settings.projectConfig.metadataMappings.push(
								{
									sourceKey: "",
									targetKey: "",
									enabled: true,
								}
							);

							await settingTab.plugin.saveSettings();
							setTimeout(() => {
								refreshMetadataMappings();
							}, 100);
						}
					});
			});
		};

		refreshMetadataMappings();

		// Default project naming section
		new Setting(containerEl)
			.setName(t("Default Project Naming"))
			.setDesc(
				t(
					"Configure fallback project naming when no explicit project is found"
				)
			)
			.setHeading();

		new Setting(containerEl)
			.setName(t("Enable default project naming"))
			.setDesc(
				t(
					"Use default naming strategy when no project is explicitly defined"
				)
			)
			.addToggle((toggle) => {
				toggle
					.setValue(
						settingTab.plugin.settings.projectConfig
							?.defaultProjectNaming?.enabled || false
					)
					.onChange(async (value) => {
						if (
							settingTab.plugin.settings.projectConfig
								?.defaultProjectNaming
						) {
							settingTab.plugin.settings.projectConfig.defaultProjectNaming.enabled =
								value;
							await settingTab.plugin.saveSettings();

							setTimeout(() => {
								settingTab.display();
							}, 200);
						}
					});
			});

		if (!settingTab.plugin.settings.projectConfig?.defaultProjectNaming) {
			settingTab.plugin.settings.projectConfig.defaultProjectNaming = {
				strategy: "filename",
				stripExtension: true,
				enabled: false,
			};
		}

		new Setting(containerEl)
			.setName(t("Naming strategy"))
			.setDesc(t("Strategy for generating default project names"))
			.addDropdown((dropdown) => {
				dropdown
					.addOption("filename", t("Use filename"))
					.addOption("foldername", t("Use folder name"))
					.addOption("metadata", t("Use metadata field"))
					.setValue(
						settingTab.plugin.settings.projectConfig
							?.defaultProjectNaming?.strategy || "filename"
					)
					.onChange(async (value) => {
						if (
							!settingTab.plugin.settings.projectConfig
								?.defaultProjectNaming
						) {
							settingTab.plugin.settings.projectConfig.defaultProjectNaming =
								{
									strategy: "filename",
									stripExtension: true,
									enabled: false,
								};
						}
						if (
							settingTab.plugin.settings.projectConfig
								?.defaultProjectNaming
						) {
							settingTab.plugin.settings.projectConfig.defaultProjectNaming.strategy =
								value as "filename" | "foldername" | "metadata";
							await settingTab.plugin.saveSettings();
							// Refresh to show/hide metadata key field
							setTimeout(() => {
								settingTab.display();
							}, 200);
						}
					});
			});

		console.log(
			settingTab.plugin.settings.projectConfig?.defaultProjectNaming
				?.strategy
		);

		// Show metadata key field only for metadata strategy
		if (
			settingTab.plugin.settings.projectConfig?.defaultProjectNaming
				?.strategy === "metadata"
		) {
			new Setting(containerEl)
				.setName(t("Metadata key"))
				.setDesc(t("Metadata field to use as project name"))
				.addText((text) => {
					text.setPlaceholder(
						t("Enter metadata key (e.g., project-name)")
					)
						.setValue(
							settingTab.plugin.settings.projectConfig
								?.defaultProjectNaming?.metadataKey || ""
						)
						.onChange(async (value) => {
							if (
								settingTab.plugin.settings.projectConfig
									?.defaultProjectNaming
							) {
								settingTab.plugin.settings.projectConfig.defaultProjectNaming.metadataKey =
									value;
								await settingTab.plugin.saveSettings();
							}
						});
				});
		}

		// Show strip extension option only for filename strategy
		if (
			settingTab.plugin.settings.projectConfig?.defaultProjectNaming
				?.strategy === "filename"
		) {
			new Setting(containerEl)
				.setName(t("Strip file extension"))
				.setDesc(
					t(
						"Remove file extension from filename when using as project name"
					)
				)
				.addToggle((toggle) => {
					toggle
						.setValue(
							settingTab.plugin.settings.projectConfig
								?.defaultProjectNaming?.stripExtension || true
						)
						.onChange(async (value) => {
							if (
								settingTab.plugin.settings.projectConfig
									?.defaultProjectNaming
							) {
								settingTab.plugin.settings.projectConfig.defaultProjectNaming.stripExtension =
									value;
								await settingTab.plugin.saveSettings();
							}
						});
				});
		}
	}
}
