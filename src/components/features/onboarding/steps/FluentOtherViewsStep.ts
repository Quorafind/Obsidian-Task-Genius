import { t } from "@/translations/helper";
import { OnboardingController } from "../OnboardingController";
import { ComponentPreviewFactory } from "../previews/ComponentPreviewFactory";
import "@/styles/onboarding-components.css";

export class FluentOtherViewsStep {
  static render(
    headerEl: HTMLElement,
    contentEl: HTMLElement,
    controller: OnboardingController
  ) {
    headerEl.empty();
    contentEl.empty();

    headerEl.createEl("h1", { text: t("Other Views") });
    headerEl.createEl("p", {
      text: t("Access Calendar, Gantt and Tags from the other views section"),
      cls: "onboarding-subtitle",
    });

    const showcase = contentEl.createDiv({ cls: "component-showcase" });
    const preview = showcase.createDiv({ cls: "component-showcase-preview focus-mode" });
    const desc = showcase.createDiv({ cls: "component-showcase-description" });

    ComponentPreviewFactory.createSidebarPreview(preview);

    const other = preview.querySelector<HTMLElement>(".v2-sidebar-section-other");
    other?.classList.add("is-focused");

    const dimTargets = preview.querySelectorAll<HTMLElement>(
      ".v2-sidebar-section-primary, .v2-sidebar-section-projects"
    );
    dimTargets.forEach((el) => el.classList.add("is-dimmed"));

    desc.createEl("h3", { text: t("Specialized views") });
    desc.createEl("p", {
      text: t(
        "Quickly reach Calendar scheduling, Gantt timelines and tag-based filtering."
      ),
    });
    const ul = desc.createEl("ul", { cls: "component-feature-list" });
    [
      t("Compact list with clear icons"),
      t("Consistent selection feedback"),
    ].forEach((txt) => ul.createEl("li", { text: txt }));
  }
}

