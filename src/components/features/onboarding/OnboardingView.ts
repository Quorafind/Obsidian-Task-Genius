import { ItemView, WorkspaceLeaf } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import { t } from "@/translations/helper";
import { OnboardingConfigManager } from "@/managers/onboarding-manager";
import { SettingsChangeDetector } from "@/services/settings-change-detector";
import { OnboardingController, OnboardingStep } from "./OnboardingController";
import { OnboardingLayout } from "./OnboardingLayout";

// Import step components
import { IntroStep } from "./steps/IntroStep";
import { ModeSelectionStep } from "./steps/ModeSelectionStep";
import { PlacementStep } from "./steps/PlacementStep";
import { UserLevelStep } from "./steps/UserLevelStep";
import { ConfigPreviewStep } from "./steps/ConfigPreviewStep";
import { TaskGuideStep } from "./steps/TaskGuideStep";
import { CompleteStep } from "./steps/CompleteStep";
import { SettingsCheckStep } from "./steps/SettingsCheckStep";

export const ONBOARDING_VIEW_TYPE = "task-genius-onboarding";

/**
 * Onboarding View - Refactored with new architecture
 *
 * Architecture:
 * - OnboardingController: Manages state and navigation
 * - OnboardingLayout: Manages UI layout (header, content, footer)
 * - Step Components: Each step is a separate component
 *
 * Flow:
 * 1. Controller manages state changes
 * 2. View listens to controller events
 * 3. View renders appropriate step component
 */
export class OnboardingView extends ItemView {
	private plugin: TaskProgressBarPlugin;
	private configManager: OnboardingConfigManager;
	private settingsDetector: SettingsChangeDetector;
	private onComplete: () => void;

	// Core components
	private controller: OnboardingController;
	private layout: OnboardingLayout;

	constructor(
		leaf: WorkspaceLeaf,
		plugin: TaskProgressBarPlugin,
		onComplete: () => void
	) {
		super(leaf);
		this.plugin = plugin;
		this.configManager = new OnboardingConfigManager(plugin);
		this.settingsDetector = new SettingsChangeDetector(plugin);
		this.onComplete = onComplete;

		// Initialize controller with initial state
		const hasUserChanges = this.settingsDetector.hasUserMadeChanges();
		this.controller = new OnboardingController({
			currentStep: OnboardingStep.INTRO,
			userHasChanges: hasUserChanges,
			changesSummary: this.settingsDetector.getChangesSummary(),
			uiMode: "fluent",
			useSideLeaves: true,
		});

		// Setup event listeners
		this.setupControllerListeners();
	}

	getViewType(): string {
		return ONBOARDING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("Task Genius Onboarding");
	}

	getIcon(): string {
		return "zap";
	}

	async onOpen() {
		// Create layout
		this.layout = new OnboardingLayout(
			this.containerEl,
			this.controller,
			{
				onNext: async () => this.handleNext(),
				onBack: async () => this.handleBack(),
				onSkip: async () => this.handleSkip(),
			}
		);

		// Render initial step
		this.renderCurrentStep();
	}

	async onClose() {
		// Cleanup
		this.containerEl.empty();
	}

	/**
	 * Setup controller event listeners
	 */
	private setupControllerListeners() {
		this.controller.on("step-changed", () => {
			this.renderCurrentStep();
		});

		this.controller.on("completed", async () => {
			await this.completeOnboarding();
		});
	}

	/**
	 * Render the current step
	 */
	private renderCurrentStep() {
		const step = this.controller.getCurrentStep();

		// Clear header and content
		this.layout.clearHeader();
		this.layout.clearContent();

		// Get header and content elements
		const headerEl = this.layout.getHeaderElement();
		const contentEl = this.layout.getContentElement();
		const footerEl = this.layout.getFooterElement();

		// Render appropriate step
		switch (step) {
			case OnboardingStep.INTRO:
				IntroStep.render(
					headerEl,
					contentEl,
					footerEl,
					this.controller
				);
				break;

			case OnboardingStep.MODE_SELECT:
				ModeSelectionStep.render(headerEl, contentEl, this.controller);
				break;

			case OnboardingStep.FLUENT_PLACEMENT:
				PlacementStep.render(headerEl, contentEl, this.controller);
				break;

			case OnboardingStep.USER_LEVEL_SELECT:
				UserLevelStep.render(
					headerEl,
					contentEl,
					this.controller,
					this.configManager
				);
				break;

			case OnboardingStep.CONFIG_PREVIEW:
				ConfigPreviewStep.render(
					headerEl,
					contentEl,
					this.controller,
					this.configManager
				);
				break;

			case OnboardingStep.TASK_CREATION_GUIDE:
				TaskGuideStep.render(
					headerEl,
					contentEl,
					this.controller,
					this.plugin
				);
				break;

			case OnboardingStep.COMPLETE:
				CompleteStep.render(headerEl, contentEl, this.controller);
				break;

			case OnboardingStep.SETTINGS_CHECK:
				SettingsCheckStep.render(
					headerEl,
					contentEl,
					this.controller
				);
				break;
		}
	}

	/**
	 * Handle next button click
	 */
	private async handleNext() {
		const step = this.controller.getCurrentStep();
		const state = this.controller.getState();

		// Special handling for INTRO step - show config check transition
		if (step === OnboardingStep.INTRO) {
			// If user has changes, show checking animation before settings check
			if (state.userHasChanges) {
				await this.showConfigCheckTransition();
			}
		}

		// Special handling for SETTINGS_CHECK step
		if (step === OnboardingStep.SETTINGS_CHECK) {
			if (state.settingsCheckAction === "keep") {
				// User chose to keep settings, skip onboarding
				await this.configManager.skipOnboarding();
				this.onComplete();
				this.leaf.detach();
				return;
			}
			// If "wizard", continue to next step normally
		}

		// Apply configuration when moving to preview
		if (
			step === OnboardingStep.USER_LEVEL_SELECT &&
			this.controller.canGoNext()
		) {
			const config = state.selectedConfig;
			if (config) {
				try {
					await this.applyArchitectureSelections();
					await this.configManager.applyConfiguration(config.mode);
				} catch (error) {
					console.error("Failed to apply configuration:", error);
					// Continue anyway, user can adjust in settings
				}
			}
		}

		// Navigate to next step
		await this.controller.next();
	}

	/**
	 * Show config check transition animation
	 */
	private async showConfigCheckTransition(): Promise<void> {
		return new Promise((resolve) => {
			// Import dynamically to avoid circular dependency
			import("./steps/intro/ConfigCheckTransition").then(
				({ ConfigCheckTransition }) => {
					const contentEl = this.layout.getContentElement();
					const state = this.controller.getState();

					// Clear content and show transition
					contentEl.empty();

					new ConfigCheckTransition(
						contentEl,
						() => {
							resolve();
						},
						state.userHasChanges
					);
				}
			);
		});
	}

	/**
	 * Handle back button click
	 */
	private async handleBack() {
		await this.controller.back();
	}

	/**
	 * Handle skip button click
	 */
	private async handleSkip() {
		await this.configManager.skipOnboarding();
		this.onComplete();
		this.leaf.detach();
	}

	/**
	 * Apply architecture selections (UI mode and sideleaves)
	 */
	private async applyArchitectureSelections() {
		const state = this.controller.getState();
		const isFluent = state.uiMode === "fluent";

		if (!this.plugin.settings.experimental) {
			(this.plugin.settings as any).experimental = {
				enableV2: false,
				showV2Ribbon: false,
			};
		}

		this.plugin.settings.experimental!.enableV2 = isFluent;

		// Prepare v2 config and set placement option when Fluent is chosen
		if (!this.plugin.settings.experimental!.v2Config) {
			(this.plugin.settings.experimental as any).v2Config = {
				enableWorkspaces: true,
				defaultWorkspace: "default",
				showTopNavigation: true,
				showNewSidebar: true,
				allowViewSwitching: true,
				persistViewMode: true,
				maxOtherViewsBeforeOverflow: 5,
			};
		}

		if (isFluent) {
			(this.plugin.settings.experimental as any).v2Config.useWorkspaceSideLeaves =
				!!state.useSideLeaves;
		}

		await this.plugin.saveSettings();
	}

	/**
	 * Complete onboarding process
	 */
	private async completeOnboarding() {
		const state = this.controller.getState();
		const config = state.selectedConfig;

		if (!config || state.isCompleting) return;

		this.controller.updateState({ isCompleting: true });

		try {
			// Mark onboarding as completed
			await this.configManager.completeOnboarding(config.mode);

			// Close view and trigger callback
			this.onComplete();
			this.leaf.detach();
		} catch (error) {
			console.error("Failed to complete onboarding:", error);
			this.controller.updateState({ isCompleting: false });
		}
	}
}
