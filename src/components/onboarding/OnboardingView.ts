import { ItemView, WorkspaceLeaf, setIcon, ButtonComponent } from "obsidian";
import type TaskProgressBarPlugin from "../../index";
import { t } from "../../translations/helper";
import {
	OnboardingConfigManager,
	OnboardingConfigMode,
	OnboardingConfig,
} from "../../managers/onboarding-manager";
import { SettingsChangeDetector } from "../../services/settings-change-detector";
import { UserLevelSelector } from "./UserLevelSelector";
import { ConfigPreview } from "./ConfigPreview";
import { TaskCreationGuide } from "./TaskCreationGuide";
import { OnboardingComplete } from "./OnboardingComplete";

export const ONBOARDING_VIEW_TYPE = "task-genius-onboarding";

export enum OnboardingStep {
	SETTINGS_CHECK = 0,    // New: Check if user wants onboarding
	WELCOME = 1,
	USER_LEVEL_SELECT = 2,
	CONFIG_PREVIEW = 3,
	TASK_CREATION_GUIDE = 4,
	COMPLETE = 5,
}

export interface OnboardingState {
	currentStep: OnboardingStep;
	selectedConfig?: OnboardingConfig;
	skipTaskGuide: boolean;
	isCompleting: boolean;
	userHasChanges: boolean;
	changesSummary: string[];
}

export class OnboardingView extends ItemView {
	private plugin: TaskProgressBarPlugin;
	private configManager: OnboardingConfigManager;
	private settingsDetector: SettingsChangeDetector;
	private onComplete: () => void;
	private state: OnboardingState;

	// Step components
	private userLevelSelector: UserLevelSelector;
	private configPreview: ConfigPreview;
	private taskCreationGuide: TaskCreationGuide;
	private onboardingComplete: OnboardingComplete;

	// UI Elements
	private onboardingHeaderEl: HTMLElement;
	private onboardingContentEl: HTMLElement;
	private footerEl: HTMLElement;
	private nextButton: ButtonComponent;
	private backButton: ButtonComponent;
	private skipButton: ButtonComponent;

	constructor(leaf: WorkspaceLeaf, plugin: TaskProgressBarPlugin, onComplete: () => void) {
		super(leaf);
		this.plugin = plugin;
		this.configManager = new OnboardingConfigManager(plugin);
		this.settingsDetector = new SettingsChangeDetector(plugin);
		this.onComplete = onComplete;

		// Initialize state
		this.state = {
			currentStep: OnboardingStep.SETTINGS_CHECK,
			skipTaskGuide: false,
			isCompleting: false,
			userHasChanges: this.settingsDetector.hasUserMadeChanges(),
			changesSummary: this.settingsDetector.getChangesSummary(),
		};

		// Initialize components
		this.userLevelSelector = new UserLevelSelector(this.configManager);
		this.configPreview = new ConfigPreview(this.configManager);
		this.taskCreationGuide = new TaskCreationGuide(this.plugin);
		this.onboardingComplete = new OnboardingComplete();
	}

	getViewType(): string {
		return ONBOARDING_VIEW_TYPE;
	}

	getDisplayText(): string {
		return t("Task Genius Setup");
	}

	getIcon(): string {
		return "zap";
	}

	async onOpen() {
		this.createViewStructure();
		this.displayCurrentStep();
	}

	async onClose() {
		// Cleanup when view is closed
		this.contentEl.empty();
	}

	/**
	 * Create the basic view structure
	 */
	private createViewStructure() {
		const container = this.contentEl;
		container.empty();
		container.addClass("onboarding-view");

		// Header section
		this.onboardingHeaderEl = container.createDiv("onboarding-header");

		// Main content section
		this.onboardingContentEl = container.createDiv("onboarding-content");

		// Footer with navigation buttons
		this.footerEl = container.createDiv("onboarding-footer");
		this.createFooterButtons();
	}

	/**
	 * Create footer navigation buttons
	 */
	private createFooterButtons() {
		const buttonContainer = this.footerEl.createDiv("onboarding-buttons");

		// Skip button (shown on appropriate steps)
		this.skipButton = new ButtonComponent(buttonContainer)
			.setButtonText(t("Skip setup"))
			.onClick(() => this.handleSkip());

		// Back button
		this.backButton = new ButtonComponent(buttonContainer)
			.setButtonText(t("Back"))
			.onClick(() => this.handleBack());

		// Next button
		this.nextButton = new ButtonComponent(buttonContainer)
			.setButtonText(t("Next"))
			.setCta()
			.onClick(() => this.handleNext());
	}

	/**
	 * Display the current step content
	 */
	private displayCurrentStep() {
		// Clear content
		this.onboardingHeaderEl.empty();
		this.onboardingContentEl.empty();

		// Update button visibility
		this.updateButtonStates();

		switch (this.state.currentStep) {
			case OnboardingStep.SETTINGS_CHECK:
				this.displaySettingsCheckStep();
				break;
			case OnboardingStep.WELCOME:
				this.displayWelcomeStep();
				break;
			case OnboardingStep.USER_LEVEL_SELECT:
				this.displayUserLevelSelectStep();
				break;
			case OnboardingStep.CONFIG_PREVIEW:
				this.displayConfigPreviewStep();
				break;
			case OnboardingStep.TASK_CREATION_GUIDE:
				this.displayTaskCreationGuideStep();
				break;
			case OnboardingStep.COMPLETE:
				this.displayCompleteStep();
				break;
		}
	}

	/**
	 * Display settings check step (new async approach)
	 */
	private displaySettingsCheckStep() {
		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Task Genius Setup") });

		// Content
		const content = this.onboardingContentEl;

		if (this.state.userHasChanges) {
			// User has made changes - ask if they want onboarding
			this.onboardingHeaderEl.createEl("p", {
				text: t("We noticed you've already configured Task Genius"),
				cls: "onboarding-subtitle",
			});

			const checkSection = content.createDiv("settings-check-section");

			// Show detected changes
			checkSection.createEl("h3", { text: t("Your current configuration includes:") });
			const changesList = checkSection.createEl("ul", { cls: "changes-summary-list" });
			
			this.state.changesSummary.forEach(change => {
				const item = changesList.createEl("li");
				const checkIcon = item.createSpan("change-check");
				setIcon(checkIcon, "check");
				item.createSpan("change-text").setText(change);
			});

			// Ask if they want onboarding
			const questionSection = content.createDiv("onboarding-question");
			questionSection.createEl("h3", { text: t("Would you like to run the setup wizard anyway?") });
			
			const optionsContainer = questionSection.createDiv("question-options");
			
			const yesButton = optionsContainer.createEl("button", {
				text: t("Yes, show me the setup wizard"),
				cls: "mod-cta question-button",
			});
			yesButton.addEventListener("click", () => {
				this.state.currentStep = OnboardingStep.WELCOME;
				this.displayCurrentStep();
			});

			const noButton = optionsContainer.createEl("button", {
				text: t("No, I'm happy with my current setup"),
				cls: "question-button",
			});
			noButton.addEventListener("click", () => this.handleSkip());

		} else {
			// User hasn't made changes - proceed with normal onboarding
			this.state.currentStep = OnboardingStep.WELCOME;
			this.displayCurrentStep();
		}
	}

	/**
	 * Display welcome step
	 */
	private displayWelcomeStep() {
		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Welcome to Task Genius") });
		this.onboardingHeaderEl.createEl("p", {
			text: t(
				"Transform your task management with advanced progress tracking and workflow automation"
			),
			cls: "onboarding-subtitle",
		});

		// Content - reuse existing welcome step logic from modal
		const content = this.onboardingContentEl;
		const welcomeSection = content.createDiv("welcome-section");

		// Plugin features overview
		const featuresContainer = welcomeSection.createDiv("features-overview");

		const features = [
			{
				icon: "bar-chart-3",
				title: t("Progress Tracking"),
				description: t(
					"Visual progress bars and completion tracking for all your tasks"
				),
			},
			{
				icon: "building",
				title: t("Project Management"),
				description: t(
					"Organize tasks by projects with advanced filtering and sorting"
				),
			},
			{
				icon: "zap",
				title: t("Workflow Automation"),
				description: t(
					"Automate task status changes and improve your productivity"
				),
			},
			{
				icon: "calendar",
				title: t("Multiple Views"),
				description: t(
					"Kanban boards, calendars, Gantt charts, and more visualization options"
				),
			},
		];

		features.forEach((feature) => {
			const featureEl = featuresContainer.createDiv("feature-item");
			const iconEl = featureEl.createDiv("feature-icon");
			setIcon(iconEl, feature.icon);
			const featureContent = featureEl.createDiv("feature-content");
			featureContent.createEl("h3", { text: feature.title });
			featureContent.createEl("p", { text: feature.description });
		});

		// Setup note
		const setupNote = content.createDiv("setup-note");
		setupNote.createEl("p", {
			text: t(
				"This quick setup will help you configure Task Genius based on your experience level and needs. You can always change these settings later."
			),
			cls: "setup-description",
		});
	}

	/**
	 * Display user level selection step
	 */
	private displayUserLevelSelectStep() {
		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Choose Your Usage Mode") });
		this.onboardingHeaderEl.createEl("p", {
			text: t(
				"Select the configuration that best matches your task management experience"
			),
			cls: "onboarding-subtitle",
		});

		// Content
		this.userLevelSelector.render(this.onboardingContentEl, (config) => {
			this.state.selectedConfig = config;
			this.updateButtonStates();
		});
	}

	/**
	 * Display configuration preview step
	 */
	private displayConfigPreviewStep() {
		if (!this.state.selectedConfig) {
			this.state.currentStep = OnboardingStep.USER_LEVEL_SELECT;
			this.displayCurrentStep();
			return;
		}

		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Configuration Preview") });
		this.onboardingHeaderEl.createEl("p", {
			text: t(
				"Review the settings that will be applied for your selected mode"
			),
			cls: "onboarding-subtitle",
		});

		// Content
		this.configPreview.render(
			this.onboardingContentEl,
			this.state.selectedConfig
		);
	}

	/**
	 * Display task creation guide step
	 */
	private displayTaskCreationGuideStep() {
		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Create Your First Task") });
		this.onboardingHeaderEl.createEl("p", {
			text: t("Learn how to create and format tasks in Task Genius"),
			cls: "onboarding-subtitle",
		});

		// Content
		this.taskCreationGuide.render(this.onboardingContentEl);
	}

	/**
	 * Display completion step
	 */
	private displayCompleteStep() {
		if (!this.state.selectedConfig) return;

		// Header
		this.onboardingHeaderEl.createEl("h1", { text: t("Setup Complete!") });
		this.onboardingHeaderEl.createEl("p", {
			text: t("Task Genius is now configured and ready to use"),
			cls: "onboarding-subtitle",
		});

		// Content
		this.onboardingComplete.render(
			this.onboardingContentEl,
			this.state.selectedConfig
		);
	}

	/**
	 * Update button states based on current step
	 */
	private updateButtonStates() {
		const step = this.state.currentStep;

		// Skip button - show on settings check and welcome
		this.skipButton.buttonEl.style.display =
			step === OnboardingStep.SETTINGS_CHECK || step === OnboardingStep.WELCOME
				? "inline-block" : "none";

		// Back button - hide on first two steps
		this.backButton.buttonEl.style.display =
			step <= OnboardingStep.WELCOME ? "none" : "inline-block";

		// Next button text and state
		const isLastStep = step === OnboardingStep.COMPLETE;
		const isSettingsCheck = step === OnboardingStep.SETTINGS_CHECK;
		
		if (isSettingsCheck) {
			this.nextButton.buttonEl.style.display = "none"; // Hide on settings check
		} else {
			this.nextButton.buttonEl.style.display = "inline-block";
			this.nextButton.setButtonText(
				isLastStep ? t("Start Using Task Genius") : t("Next")
			);
		}

		// Enable/disable next based on selection
		if (step === OnboardingStep.USER_LEVEL_SELECT) {
			this.nextButton.setDisabled(!this.state.selectedConfig);
		} else {
			this.nextButton.setDisabled(this.state.isCompleting);
		}
	}

	/**
	 * Handle skip onboarding
	 */
	private async handleSkip() {
		await this.configManager.skipOnboarding();
		this.onComplete();
		this.close();
	}

	/**
	 * Handle back navigation
	 */
	private handleBack() {
		if (this.state.currentStep > OnboardingStep.SETTINGS_CHECK) {
			this.state.currentStep--;

			// Skip task guide if it was skipped
			if (
				this.state.currentStep === OnboardingStep.TASK_CREATION_GUIDE &&
				this.state.skipTaskGuide
			) {
				this.state.currentStep--;
			}

			this.displayCurrentStep();
		}
	}

	/**
	 * Handle next navigation
	 */
	private async handleNext() {
		const step = this.state.currentStep;

		// Handle completion
		if (step === OnboardingStep.COMPLETE) {
			await this.completeOnboarding();
			return;
		}

		// Validate current step
		if (!this.validateCurrentStep()) {
			return;
		}

		// Move to next step
		this.state.currentStep++;

		// Apply configuration when moving to preview
		if (
			this.state.currentStep === OnboardingStep.CONFIG_PREVIEW &&
			this.state.selectedConfig
		) {
			try {
				await this.configManager.applyConfiguration(
					this.state.selectedConfig.mode
				);
			} catch (error) {
				console.error("Failed to apply configuration:", error);
				// Continue anyway, user can adjust in settings
			}
		}

		// Skip task guide if requested
		if (
			this.state.currentStep === OnboardingStep.TASK_CREATION_GUIDE &&
			this.state.skipTaskGuide
		) {
			this.state.currentStep++;
		}

		this.displayCurrentStep();
	}

	/**
	 * Validate current step before proceeding
	 */
	private validateCurrentStep(): boolean {
		switch (this.state.currentStep) {
			case OnboardingStep.USER_LEVEL_SELECT:
				return !!this.state.selectedConfig;
			default:
				return true;
		}
	}

	/**
	 * Complete onboarding process
	 */
	private async completeOnboarding() {
		if (!this.state.selectedConfig || this.state.isCompleting) return;

		this.state.isCompleting = true;
		this.updateButtonStates();

		try {
			// Mark onboarding as completed
			await this.configManager.completeOnboarding(
				this.state.selectedConfig.mode
			);

			// Close view and trigger callback
			this.onComplete();
			this.close();
		} catch (error) {
			console.error("Failed to complete onboarding:", error);
			this.state.isCompleting = false;
			this.updateButtonStates();
		}
	}

	/**
	 * Close the onboarding view
	 */
	private close() {
		this.leaf.detach();
	}
}