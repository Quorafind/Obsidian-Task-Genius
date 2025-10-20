import { t } from "@/translations/helper";
import { Notice } from "obsidian";
import type TaskProgressBarPlugin from "@/index";
import { QuickCaptureModal } from "@/components/features/quick-capture/modals/QuickCaptureModalWithSwitch";

/**
 * Quick Capture Demo Component - Demo quick capture feature
 */
export class QuickCaptureDemo {
	/**
	 * Render quick capture demo
	 */
	static render(container: HTMLElement, plugin: TaskProgressBarPlugin) {
		const section = container.createDiv("quick-capture-section");
		section.createEl("h3", { text: t("Quick Capture") });

		const demo = section.createDiv("demo-content");
		demo.createEl("p", {
			text: t(
				"Use Quick Capture to quickly create tasks from anywhere in Obsidian",
			),
		});

		// Demo button
		const button = demo.createEl("button", {
			text: t("Try Quick Capture"),
			cls: "mod-cta demo-button",
		});

		button.addEventListener("click", () => {
			try {
				if (plugin.settings.quickCapture?.enableQuickCapture) {
					new QuickCaptureModal(plugin.app, plugin).open();
				} else {
					new Notice(
						t(
							"Quick capture is now enabled in your configuration!",
						),
						3000,
					);
				}
			} catch (error) {
				console.error("Failed to open quick capture:", error);
				new Notice(
					t("Failed to open quick capture. Please try again later."),
					3000,
				);
			}
		});
	}
}
