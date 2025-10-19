import { Setting, Notice } from "obsidian";
import { TaskProgressBarSettingTab } from "@/setting";
import { t } from "@/translations/helper";
import {
	SelectableCard,
	SelectableCardConfig,
} from "@/components/features/onboarding/ui/SelectableCard";

export function renderInterfaceSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement,
) {
	// Header
	new Setting(containerEl)
		.setName(t("User Interface"))
		.setDesc(
			t(
				"Choose your preferred interface style and configure how Task Genius displays in your workspace.",
			),
		)
		.setHeading();

	// Mode Selection Section
	new Setting(containerEl)
		.setName(t("Interface Mode"))
		.setDesc(
			t(
				"Select between the modern Fluent interface or the classic Legacy interface.",
			),
		)
		.setHeading();

	// Create mode selection container
	const modeSelectionContainer = containerEl.createDiv({
		cls: "interface-mode-selection",
	});

	// Get current mode
	const currentMode = settingTab.plugin.settings.fluentView?.enableFluent
		? "fluent"
		: "legacy";

	// Create cards configuration
	const cardConfigs: SelectableCardConfig<string>[] = [
		{
			id: "fluent",
			title: t("Fluent"),
			subtitle: t("Modern & Sleek"),
			description: t(
				"New visual design with elegant animations and modern interactions",
			),
			preview: createFluentPreview(),
		},
		{
			id: "legacy",
			title: t("Legacy"),
			subtitle: t("Classic & Familiar"),
			description: t(
				"Keep the familiar interface and interaction style you know",
			),
			preview: createLegacyPreview(),
		},
	];

	// Create selectable cards
	const card = new SelectableCard<string>(
		modeSelectionContainer,
		cardConfigs,
		{
			containerClass: "selectable-cards-container",
			cardClass: "selectable-card",
			showPreview: true,
		},
		async (mode) => {
			// Update settings
			if (!settingTab.plugin.settings.fluentView) {
				settingTab.plugin.settings.fluentView = {
					enableFluent: false,
				};
			}
			settingTab.plugin.settings.fluentView.enableFluent =
				mode === "fluent";
			await settingTab.plugin.saveSettings();

			// Re-render the settings to show/hide Fluent-specific options
			renderFluentSpecificSettings();
		},
	);

	// Set initial selection
	card.setSelected(currentMode);

	// Container for Fluent-specific settings
	const fluentSettingsContainer = containerEl.createDiv({
		cls: "fluent-specific-settings",
	});

	// Function to render Fluent-specific settings
	const renderFluentSpecificSettings = () => {
		// Clear the container
		fluentSettingsContainer.empty();

		// Only show if Fluent is enabled
		if (!settingTab.plugin.settings.fluentView?.enableFluent) {
			return;
		}

		// Fluent Settings Header
		new Setting(fluentSettingsContainer)
			.setName(t("Fluent Interface Settings"))
			.setDesc(t("Configure options specific to the Fluent interface."))
			.setHeading();

		// Use workspace side leaves for Sidebar & Details
		new Setting(fluentSettingsContainer)
			.setName(t("Use Workspace Side Leaves"))
			.setDesc(
				t(
					"Use left/right workspace side leaves for Sidebar and Details. When enabled, the main fluent view won't render in-view sidebar or details.",
				),
			)
			.addToggle((toggle) => {
				const current =
					settingTab.plugin.settings.fluentView
						?.useWorkspaceSideLeaves ?? true;
				toggle.setValue(current).onChange(async (value) => {
					if (!settingTab.plugin.settings.fluentView) {
						settingTab.plugin.settings.fluentView = {
							enableFluent: false,
						};
					}
					if (!settingTab.plugin.settings.fluentView.fluentConfig) {
						settingTab.plugin.settings.fluentView.fluentConfig = {
							enableWorkspaces: true,
							defaultWorkspace: "default",
						};
					}
					// Store via 'any' to avoid typing constraints for experimental backfill
					(
						settingTab.plugin.settings.fluentView as any
					).useWorkspaceSideLeaves = value;
					await settingTab.plugin.saveSettings();
					new Notice(t("Saved. Reopen the view to apply."));
				});
			});

		// Max Other Views before overflow threshold
		new Setting(fluentSettingsContainer)
			.setName(t("Max Other Views before overflow"))
			.setDesc(
				t(
					"Number of 'Other Views' to show before grouping the rest into an overflow menu (ellipsis)",
				),
			)
			.addText((text) => {
				const current =
					settingTab.plugin.settings.fluentView?.fluentConfig
						?.maxOtherViewsBeforeOverflow ?? 5;
				text.setPlaceholder("5")
					.setValue(String(current))
					.onChange(async (value) => {
						const n = parseInt(value, 10);
						if (!isNaN(n) && n >= 1 && n <= 50) {
							if (!settingTab.plugin.settings.fluentView) {
								settingTab.plugin.settings.fluentView = {
									enableFluent: false,
								};
							}
							if (
								!settingTab.plugin.settings.fluentView
									.fluentConfig
							) {
								settingTab.plugin.settings.fluentView.fluentConfig =
									{
										enableWorkspaces: true,
										defaultWorkspace: "default",
									};
							}
							settingTab.plugin.settings.fluentView.fluentConfig.maxOtherViewsBeforeOverflow =
								n;
							await settingTab.plugin.saveSettings();
						}
					});
			});
	};

	// Initial render of Fluent-specific settings
	renderFluentSpecificSettings();
}

/**
 * Create Fluent mode preview
 */
function createFluentPreview(): HTMLElement {
	const preview = createDiv({
		cls: ["mode-preview", "mode-preview-fluent"],
	});

	// Check theme
	const isDark = document.body.classList.contains("theme-dark");
	const theme = isDark ? "" : "-light";
	const imageUrl = `https://raw.githubusercontent.com/Quorafind/Obsidian-Task-Progress-Bar/master/media/fluent${theme}.png`;

	const img = preview.createEl("img", {
		attr: {
			src: imageUrl,
			alt: "Fluent mode preview",
		},
	});
	img.style.maxWidth = "100%";
	img.style.maxHeight = "100%";
	img.style.objectFit = "contain";
	img.style.borderRadius = "4px";

	return preview;
}

/**
 * Create Legacy mode preview
 */
function createLegacyPreview(): HTMLElement {
	const preview = createDiv({
		cls: ["mode-preview", "mode-preview-legacy"],
	});

	// Check theme
	const isDark = document.body.classList.contains("theme-dark");
	const theme = isDark ? "" : "-light";
	const imageUrl = `https://raw.githubusercontent.com/Quorafind/Obsidian-Task-Progress-Bar/master/media/legacy${theme}.png`;

	const img = preview.createEl("img", {
		attr: {
			src: imageUrl,
			alt: "Legacy mode preview",
		},
	});
	img.style.maxWidth = "100%";
	img.style.maxHeight = "100%";
	img.style.objectFit = "contain";
	img.style.borderRadius = "4px";

	return preview;
}
