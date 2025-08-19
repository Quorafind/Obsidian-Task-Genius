import { OnboardingConfig } from "../../managers/onboarding-manager";
import { t } from "../../translations/helper";
import { setIcon } from "obsidian";

export class OnboardingComplete {
	/**
	 * Render onboarding completion page
	 */
	render(containerEl: HTMLElement, config: OnboardingConfig) {
		containerEl.empty();

		// Success message
		const successSection = containerEl.createDiv("completion-success");
		const successIcon = successSection.createDiv("success-icon");
		successIcon.setText("🎉");

		successSection.createEl("h2", { text: t("Congratulations!") });
		successSection.createEl("p", {
			text: t(
				"Task Genius has been configured with your selected preferences"
			),
			cls: "success-message",
		});

		// Configuration summary
		const summarySection = containerEl.createDiv("completion-summary");
		summarySection.createEl("h3", { text: t("Your Configuration") });

		const configCard = summarySection.createDiv("config-summary-card");

		const configHeader = configCard.createDiv("config-header");
		const iconEl = configHeader.createDiv("config-icon");
		setIcon(iconEl, this.getConfigIcon(config.mode));
		configHeader.createDiv("config-name").setText(config.name);

		const configDescription = configCard.createDiv("config-description");
		configDescription.setText(config.description);

		// Quick start guide
		const quickStartSection = containerEl.createDiv("quick-start-section");
		quickStartSection.createEl("h3", { text: t("Quick Start Guide") });

		const stepsContainer = quickStartSection.createDiv("quick-start-steps");

		const quickStartSteps = this.getQuickStartSteps(config.mode);
		quickStartSteps.forEach((step, index) => {
			const stepEl = stepsContainer.createDiv("quick-start-step");
			stepEl.createDiv("step-number").setText((index + 1).toString());
			stepEl.createDiv("step-content").setText(step);
		});

		// Next steps
		const nextStepsSection = containerEl.createDiv("next-steps-section");
		nextStepsSection.createEl("h3", { text: t("What's next?") });

		const nextStepsList = nextStepsSection.createEl("ul", {
			cls: "next-steps-list",
		});
		const nextSteps = [
			t("Open Task Genius view from the left ribbon"),
			t("Create your first task using Quick Capture"),
			t("Explore different views to organize your tasks"),
			t("Customize settings anytime in plugin settings"),
		];

		nextSteps.forEach((step) => {
			const item = nextStepsList.createEl("li");
			const checkIcon = item.createSpan("step-check");
			setIcon(checkIcon, "arrow-right");
			item.createSpan("step-text").setText(step);
		});

		// Helpful resources
		const resourcesSection = containerEl.createDiv("resources-section");
		resourcesSection.createEl("h3", { text: t("Helpful Resources") });

		const resourcesList = resourcesSection.createDiv("resources-list");

		const resources = [
			{
				icon: "book-open", // Lucide book icon
				title: t("Documentation"),
				description: t("Complete guide to all features"),
				url: "https://taskgenius.md",
			},
			{
				icon: "message-circle", // Lucide message circle icon
				title: t("Community"),
				description: t("Get help and share tips"),
				url: "https://discord.gg/ARR2rHHX6b",
			},
			{
				icon: "settings", // Lucide settings icon
				title: t("Settings"),
				description: t("Customize Task Genius"),
				action: "open-settings",
			},
		];

		resources.forEach((resource) => {
			const resourceEl = resourcesList.createDiv("resource-item");

			const resourceContent = resourceEl.createDiv("resource-content");
			resourceContent.createEl("h4", { text: resource.title });
			resourceContent.createEl("p", { text: resource.description });

			if (resource.url) {
				resourceEl.addEventListener("click", () => {
					window.open(resource.url, "_blank");
				});
				resourceEl.addClass("resource-clickable");
			} else if (resource.action === "open-settings") {
				resourceEl.addEventListener("click", () => {
					// Open plugin settings
					// This will be handled by the main plugin
					const event = new CustomEvent("task-genius-open-settings");
					document.dispatchEvent(event);
				});
				resourceEl.addClass("resource-clickable");
			}
		});
	}

	/**
	 * Get configuration icon
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
	 * Get quick start steps based on configuration mode
	 */
	private getQuickStartSteps(mode: string): string[] {
		switch (mode) {
			case "beginner":
				return [
					t("Click the Task Genius icon in the left sidebar"),
					t("Start with the Inbox view to see all your tasks"),
					t("Use quick capture panel to quickly add your first task"),
					t("Try the Forecast view to see tasks by date"),
				];
			case "advanced":
				return [
					t("Open Task Genius and explore the available views"),
					t("Set up a project using the Projects view"),
					t("Try the Kanban board for visual task management"),
					t("Use workflow stages to track task progress"),
				];
			case "power":
				return [
					t("Explore all available views and their configurations"),
					t("Set up complex workflows for your projects"),
					t("Configure habits and rewards to stay motivated"),
					t("Integrate with external calendars and systems"),
				];
			default:
				return [
					t("Open Task Genius from the left sidebar"),
					t("Create your first task"),
					t("Explore the different views available"),
					t("Customize settings as needed"),
				];
		}
	}

	/**
	 * Handle feedback submission
	 */
	private handleFeedback(
		type: "positive" | "negative",
		feedbackSection: HTMLElement
	) {
		// Find and remove existing feedback buttons
		const buttonsEl = feedbackSection.querySelector(".feedback-buttons");
		if (buttonsEl) {
			buttonsEl.remove();
		}

		// Show thank you message
		const thankYouEl = feedbackSection.createDiv("feedback-thanks");
		thankYouEl.createEl("p", {
			text:
				type === "positive"
					? t("Thank you for your positive feedback!")
					: t(
							"Thank you for your feedback. We'll continue improving the experience."
					  ),
			cls: "feedback-thanks-message",
		});

		// For negative feedback, could add a link to feedback form
		if (type === "negative") {
			const feedbackLink = thankYouEl.createEl("a", {
				text: t("Share detailed feedback"),
				href: "https://github.com/obsidian-task-genius/feedback/issues/new",
			});
			feedbackLink.setAttribute("target", "_blank");
		}

		// Log feedback (could be sent to analytics in the future)
		console.log(`Onboarding feedback: ${type}`);
	}
}
