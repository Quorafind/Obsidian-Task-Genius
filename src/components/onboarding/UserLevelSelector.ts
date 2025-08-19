import {
	OnboardingConfigManager,
	OnboardingConfig,
} from "../../managers/onboarding-manager";
import { t } from "../../translations/helper";
import { setIcon } from "obsidian";

export class UserLevelSelector {
	private configManager: OnboardingConfigManager;
	private selectedConfig: OnboardingConfig | null = null;
	private onSelectionChange: (config: OnboardingConfig) => void = () => {};

	constructor(configManager: OnboardingConfigManager) {
		this.configManager = configManager;
	}

	/**
	 * Render the user level selector
	 */
	render(
		containerEl: HTMLElement,
		onSelectionChange: (config: OnboardingConfig) => void
	) {
		this.onSelectionChange = onSelectionChange;
		containerEl.empty();

		const configs = this.configManager.getOnboardingConfigs();

		// Create card container
		const cardsContainer = containerEl.createDiv("user-level-cards");

		// Create cards for each configuration
		configs.forEach((config) => {
			this.createConfigCard(cardsContainer, config);
		});
	}

	/**
	 * Create a configuration card
	 */
	private createConfigCard(container: HTMLElement, config: OnboardingConfig) {
		const card = container.createDiv("user-level-card");
		card.setAttribute("data-mode", config.mode);

		// Card header with icon and title
		const cardHeader = card.createDiv("card-header");

		const iconEl = cardHeader.createDiv("card-icon");
		setIcon(iconEl, this.getConfigIcon(config.mode));

		const titleEl = cardHeader.createEl("h3", {
			text: config.name,
			cls: "card-title",
		});

		// Card description
		const descEl = card.createEl("p", {
			text: config.description,
			cls: "card-description",
		});

		// Features list
		const featuresEl = card.createDiv("card-features");
		const featuresList = featuresEl.createEl("ul");

		config.features.forEach((feature) => {
			const featureItem = featuresList.createEl("li");
			featureItem.setText(feature);
		});

		// Recommendation badge for beginner
		// if (config.mode === 'beginner') {
		// 	const badge = card.createDiv("recommendation-badge");
		// 	badge.setText(t("Recommended for new users"));
		// }

		// Click handler
		card.addEventListener("click", () => {
			this.selectConfig(config);
		});

		// Hover effects
		card.addEventListener("mouseenter", () => {
			card.addClass("card-hover");
		});

		card.addEventListener("mouseleave", () => {
			card.removeClass("card-hover");
		});
	}

	/**
	 * Get icon for configuration mode
	 */
	private getConfigIcon(mode: string): string {
		switch (mode) {
			case "beginner":
				return "edit-3"; // Lucide edit icon
			case "advanced":
				return "settings"; // Lucide settings icon
			case "power":
				return "zap"; // Lucide lightning bolt icon
			default:
				return "clipboard-list"; // Lucide clipboard icon
		}
	}

	/**
	 * Select a configuration
	 */
	private selectConfig(config: OnboardingConfig) {
		// Remove previous selection
		if (this.selectedConfig) {
			const prevCard = document.querySelector(
				`[data-mode="${this.selectedConfig.mode}"]`
			);
			prevCard?.removeClass("selected");
		}

		// Select new config
		this.selectedConfig = config;
		const newCard = document.querySelector(`[data-mode="${config.mode}"]`);
		newCard?.addClass("selected");

		// Trigger callback
		this.onSelectionChange(config);
	}

	/**
	 * Get selected configuration
	 */
	getSelectedConfig(): OnboardingConfig | null {
		return this.selectedConfig;
	}
}
