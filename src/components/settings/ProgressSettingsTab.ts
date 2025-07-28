import { Setting, TextAreaComponent } from "obsidian";
import { DEFAULT_SETTINGS } from "../../common/setting-definition";
import { t } from "../../translations/helper";
import { TaskProgressBarSettingTab } from "../../setting";
import { formatProgressText } from "../../editor-ext/progressBarWidget";

export function renderProgressSettingsTab(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("Progress bar"))
		.setDesc(
			t(
				"You can customize the progress bar behind the parent task(usually at the end of the task). You can also customize the progress bar for the task below the heading."
			)
		)
		.setHeading()
		.settingEl.setAttribute("data-setting-id", "progress-bar-main");

	const progressDisplaySetting = new Setting(containerEl)
		.setName(t("Progress display mode"))
		.setDesc(t("Choose how to display task progress"))
		.addDropdown((dropdown) =>
			dropdown
				.addOption("none", t("No progress indicators"))
				.addOption("graphical", t("Graphical progress bar"))
				.addOption("text", t("Text progress indicator"))
				.addOption("both", t("Both graphical and text"))
				.setValue(settingTab.plugin.settings.progressBarDisplayMode)
				.onChange(async (value: any) => {
					settingTab.plugin.settings.progressBarDisplayMode = value;
					settingTab.applySettingsUpdate();
					settingTab.display();
				})
		);
	progressDisplaySetting.settingEl.setAttribute("data-setting-id", "progress-display-mode");

	// Only show these options if some form of progress bar is enabled
	if (settingTab.plugin.settings.progressBarDisplayMode !== "none") {
		new Setting(containerEl)
			.setName(t("Enable progress bar in reading mode"))
			.setDesc(
				t(
					"Toggle this to allow this plugin to show progress bars in reading mode."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings
							.enableProgressbarInReadingMode
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.enableProgressbarInReadingMode =
							value;

						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Support hover to show progress info"))
			.setDesc(
				t(
					"Toggle this to allow this plugin to show progress info when hovering over the progress bar."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings
							.supportHoverToShowProgressInfo
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.supportHoverToShowProgressInfo =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Add progress bar to non-task bullet"))
			.setDesc(
				t(
					"Toggle this to allow adding progress bars to regular list items (non-task bullets)."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings.addProgressBarToNonTaskBullet
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.addProgressBarToNonTaskBullet =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Add progress bar to Heading"))
			.setDesc(
				t(
					"Toggle this to allow this plugin to add progress bar for Task below the headings."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings.addTaskProgressBarToHeading
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.addTaskProgressBarToHeading =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Count sub children of current Task"))
			.setDesc(
				t(
					"Toggle this to allow this plugin to count sub tasks when generating progress bar."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settingTab.plugin.settings.countSubLevel)
					.onChange(async (value) => {
						settingTab.plugin.settings.countSubLevel = value;
						settingTab.applySettingsUpdate();
					})
			);

		new Setting(containerEl)
			.setName(t("Use custom goal for progress bar"))
			.setDesc(
				t(
					"Toggle this to allow this plugin to find the pattern g::number as goal of the parent task."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings.allowCustomProgressGoal
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.allowCustomProgressGoal =
							value;
						settingTab.applySettingsUpdate();
					})
			);

		// Only show the number settings for modes that include text display
		if (
			settingTab.plugin.settings.progressBarDisplayMode === "text" ||
			settingTab.plugin.settings.progressBarDisplayMode === "both"
		) {
			displayNumberToProgressbar(settingTab, containerEl);
		}

		new Setting(containerEl).setName(t("Hide progress bars")).setHeading();

		new Setting(containerEl)
			.setName(t("Hide progress bars based on conditions"))
			.setDesc(
				t(
					"Toggle this to enable hiding progress bars based on tags, folders, or metadata."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(
						settingTab.plugin.settings
							.hideProgressBarBasedOnConditions
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.hideProgressBarBasedOnConditions =
							value;
						settingTab.applySettingsUpdate();

						setTimeout(() => {
							settingTab.display();
						}, 200);
					})
			);

		if (settingTab.plugin.settings.hideProgressBarBasedOnConditions) {
			new Setting(containerEl)
				.setName(t("Hide by tags"))
				.setDesc(
					t(
						'Specify tags that will hide progress bars (comma-separated, without #). Example: "no-progress-bar,hide-progress"'
					)
				)
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_SETTINGS.hideProgressBarTags)
						.setValue(
							settingTab.plugin.settings.hideProgressBarTags
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.hideProgressBarTags =
								value;
							settingTab.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName(t("Hide by folders"))
				.setDesc(
					t(
						'Specify folder paths that will hide progress bars (comma-separated). Example: "Daily Notes,Projects/Hidden"'
					)
				)
				.addText((text) =>
					text
						.setPlaceholder("folder1,folder2/subfolder")
						.setValue(
							settingTab.plugin.settings.hideProgressBarFolders
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.hideProgressBarFolders =
								value;
							settingTab.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName(t("Hide by metadata"))
				.setDesc(
					t(
						'Specify frontmatter metadata that will hide progress bars. Example: "hide-progress-bar: true"'
					)
				)
				.addText((text) =>
					text
						.setPlaceholder(
							DEFAULT_SETTINGS.hideProgressBarMetadata
						)
						.setValue(
							settingTab.plugin.settings.hideProgressBarMetadata
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.hideProgressBarMetadata =
								value;
							settingTab.applySettingsUpdate();
						})
				);

			new Setting(containerEl)
				.setName(t("Show progress bars based on heading"))
				.setDesc(
					t(
						"Toggle this to enable showing progress bars based on heading."
					)
				)
				.addText((text) =>
					text
						.setPlaceholder(t("# heading"))
						.setValue(
							settingTab.plugin.settings
								.showProgressBarBasedOnHeading
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.showProgressBarBasedOnHeading =
								value;
							settingTab.applySettingsUpdate();
						})
				);
		}
	}
}

function displayNumberToProgressbar(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
): void {
	// Add setting for display mode
	new Setting(containerEl)
		.setName(t("Progress format"))
		.setDesc(t("Choose how to display the task progress"))
		.addDropdown((dropdown) => {
			dropdown
				.addOption("percentage", t("Percentage (75%)"))
				.addOption(
					"bracketPercentage",
					t("Bracketed percentage ([75%])")
				)
				.addOption("fraction", t("Fraction (3/4)"))
				.addOption("bracketFraction", t("Bracketed fraction ([3/4])"))
				.addOption("detailed", t("Detailed ([3✓ 1⟳ 0✗ 1? / 5])"))
				.addOption("custom", t("Custom format"))
				.addOption("range-based", t("Range-based text"))
				.setValue(
					settingTab.plugin.settings.displayMode || "bracketFraction"
				)
				.onChange(async (value: any) => {
					settingTab.plugin.settings.displayMode = value;
					settingTab.applySettingsUpdate();
					settingTab.display();
				});
		});

	// Show custom format setting only when custom format is selected
	if (settingTab.plugin.settings.displayMode === "custom") {
		const fragment = document.createDocumentFragment();
		fragment.createEl("div", {
			cls: "custom-format-placeholder-info",
			text: t(
				"Use placeholders like {{COMPLETED}}, {{TOTAL}}, {{PERCENT}}, etc."
			),
		});

		fragment.createEl("div", {
			cls: "custom-format-placeholder-info",
			text: t(
				"Available placeholders: {{COMPLETED}}, {{TOTAL}}, {{IN_PROGRESS}}, {{ABANDONED}}, {{PLANNED}}, {{NOT_STARTED}}, {{PERCENT}}, {{COMPLETED_SYMBOL}}, {{IN_PROGRESS_SYMBOL}}, {{ABANDONED_SYMBOL}}, {{PLANNED_SYMBOL}}"
			),
		});

		fragment.createEl("div", {
			cls: "custom-format-placeholder-info",
			text: t(
				"Support expression in format, like using data.percentages to get the percentage of completed tasks. And using math or even repeat functions to get the result."
			),
		});

		new Setting(containerEl).setName(t("Custom format")).setDesc(fragment);

		const previewEl = containerEl.createDiv({
			cls: "custom-format-preview-container",
		});

		const previewLabel = previewEl.createDiv({
			cls: "custom-format-preview-label",
			text: t("Preview:"),
		});

		const previewContent = previewEl.createDiv({
			cls: "custom-format-preview-content",
		});

		// 初始预览
		updateFormatPreview(
			settingTab,
			containerEl,
			settingTab.plugin.settings.customFormat ||
				"[{{COMPLETED}}/{{TOTAL}}]"
		);

		const textarea = containerEl.createEl(
			"div",
			{
				cls: "custom-format-textarea-container",
			},
			(el) => {
				const textAreaComponent = new TextAreaComponent(el);
				textAreaComponent.inputEl.toggleClass(
					"custom-format-textarea",
					true
				);
				textAreaComponent
					.setPlaceholder("[{{COMPLETED}}/{{TOTAL}}]")
					.setValue(
						settingTab.plugin.settings.customFormat ||
							"[{{COMPLETED}}/{{TOTAL}}]"
					)
					.onChange(async (value) => {
						settingTab.plugin.settings.customFormat = value;
						settingTab.applySettingsUpdate();
						// 更新预览
						updateFormatPreview(settingTab, containerEl, value);
					});
			}
		);

		// 添加预览区域

		// Show examples of advanced formats using expressions
		new Setting(containerEl)
			.setName(t("Expression examples"))
			.setDesc(t("Examples of advanced formats using expressions"))
			.setHeading();

		const exampleContainer = containerEl.createEl("div", {
			cls: "expression-examples",
		});

		const examples = [
			{
				name: t("Text Progress Bar"),
				code: '[${="=".repeat(Math.floor(data.percentages.completed/10)) + " ".repeat(10-Math.floor(data.percentages.completed/10))}] {{PERCENT}}%',
			},
			{
				name: t("Emoji Progress Bar"),
				code: '${="⬛".repeat(Math.floor(data.percentages.completed/10)) + "⬜".repeat(10-Math.floor(data.percentages.completed/10))} {{PERCENT}}%',
			},
			{
				name: t("Color-coded Status"),
				code: "{{COMPLETED}}/{{TOTAL}} ${=data.percentages.completed < 30 ? '🔴' : data.percentages.completed < 70 ? '🟠' : '🟢'}",
			},
			{
				name: t("Status with Icons"),
				code: "[{{COMPLETED_SYMBOL}}:{{COMPLETED}} {{IN_PROGRESS_SYMBOL}}:{{IN_PROGRESS}} {{PLANNED_SYMBOL}}:{{PLANNED}} / {{TOTAL}}]",
			},
		];

		examples.forEach((example) => {
			const exampleItem = exampleContainer.createEl("div", {
				cls: "expression-example-item",
			});

			exampleItem.createEl("div", {
				cls: "expression-example-name",
				text: example.name,
			});

			const codeEl = exampleItem.createEl("code", {
				cls: "expression-example-code",
				text: example.code,
			});

			// 添加预览效果
			const previewEl = exampleItem.createEl("div", {
				cls: "expression-example-preview",
			});

			// 创建示例数据来渲染预览
			const sampleData = {
				completed: 3,
				total: 5,
				inProgress: 1,
				abandoned: 0,
				notStarted: 0,
				planned: 1,
				percentages: {
					completed: 60,
					inProgress: 20,
					abandoned: 0,
					notStarted: 0,
					planned: 20,
				},
			};

			try {
				const renderedText = renderFormatPreview(
					settingTab,
					example.code,
					sampleData
				);
				previewEl.setText(`${t("Preview")}: ${renderedText}`);
			} catch (error) {
				previewEl.setText(`${t("Preview")}: Error`);
				previewEl.addClass("expression-preview-error");
			}

			const useButton = exampleItem.createEl("button", {
				cls: "expression-example-use",
				text: t("Use"),
			});

			useButton.addEventListener("click", () => {
				settingTab.plugin.settings.customFormat = example.code;
				settingTab.applySettingsUpdate();

				const inputs = containerEl.querySelectorAll("textarea");
				for (const input of Array.from(inputs)) {
					if (input.placeholder === "[{{COMPLETED}}/{{TOTAL}}]") {
						input.value = example.code;
						break;
					}
				}

				updateFormatPreview(settingTab, containerEl, example.code);
			});
		});
	}
	// Only show legacy percentage toggle for range-based or when displayMode is not set
	else if (
		settingTab.plugin.settings.displayMode === "range-based" ||
		!settingTab.plugin.settings.displayMode
	) {
		new Setting(containerEl)
			.setName(t("Show percentage"))
			.setDesc(
				t(
					"Toggle this to show percentage instead of completed/total count."
				)
			)
			.addToggle((toggle) =>
				toggle
					.setValue(settingTab.plugin.settings.showPercentage)
					.onChange(async (value) => {
						settingTab.plugin.settings.showPercentage = value;
						settingTab.applySettingsUpdate();
					})
			);

		// If percentage display and range-based mode is selected
		if (
			settingTab.plugin.settings.showPercentage &&
			settingTab.plugin.settings.displayMode === "range-based"
		) {
			new Setting(containerEl)
				.setName(t("Customize progress ranges"))
				.setDesc(
					t(
						"Toggle this to customize the text for different progress ranges."
					)
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							settingTab.plugin.settings.customizeProgressRanges
						)
						.onChange(async (value) => {
							settingTab.plugin.settings.customizeProgressRanges =
								value;
							settingTab.applySettingsUpdate();
							settingTab.display();
						})
				);

			if (settingTab.plugin.settings.customizeProgressRanges) {
				addProgressRangesSettings(settingTab, containerEl);
			}
		}
	}
}

function addProgressRangesSettings(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement
) {
	new Setting(containerEl)
		.setName(t("Progress Ranges"))
		.setDesc(
			t(
				"Define progress ranges and their corresponding text representations."
			)
		)
		.setHeading();

	// Display existing ranges
	settingTab.plugin.settings.progressRanges.forEach((range, index) => {
		new Setting(containerEl)
			.setName(`${t("Range")} ${index + 1}: ${range.min}%-${range.max}%`)
			.setDesc(
				`${t("Use")} {{PROGRESS}} ${t(
					"as a placeholder for the percentage value"
				)}`
			)
			.addText((text) =>
				text
					.setPlaceholder(
						`${t("Template text with")} {{PROGRESS}} ${t(
							"placeholder"
						)}`
					)
					.setValue(range.text)
					.onChange(async (value) => {
						settingTab.plugin.settings.progressRanges[index].text =
							value;
						settingTab.applySettingsUpdate();
					})
			)
			.addButton((button) => {
				button.setButtonText("Delete").onClick(async () => {
					settingTab.plugin.settings.progressRanges.splice(index, 1);
					settingTab.applySettingsUpdate();
					settingTab.display();
				});
			});
	});

	new Setting(containerEl)
		.setName(t("Add new range"))
		.setDesc(t("Add a new progress percentage range with custom text"));

	// Add a new range
	const newRangeSetting = new Setting(containerEl);
	newRangeSetting.infoEl.detach();

	newRangeSetting
		.addText((text) =>
			text
				.setPlaceholder(t("Min percentage (0-100)"))
				.setValue("")
				.onChange(async (value) => {
					// This will be handled when the user clicks the Add button
				})
		)
		.addText((text) =>
			text
				.setPlaceholder(t("Max percentage (0-100)"))
				.setValue("")
				.onChange(async (value) => {
					// This will be handled when the user clicks the Add button
				})
		)
		.addText((text) =>
			text
				.setPlaceholder(t("Text template (use {{PROGRESS}})"))
				.setValue("")
				.onChange(async (value) => {
					// This will be handled when the user clicks the Add button
				})
		)
		.addButton((button) => {
			button.setButtonText("Add").onClick(async () => {
				const settingsContainer = button.buttonEl.parentElement;
				if (!settingsContainer) return;

				const inputs = settingsContainer.querySelectorAll("input");
				if (inputs.length < 3) return;

				const min = parseInt(inputs[0].value);
				const max = parseInt(inputs[1].value);
				const text = inputs[2].value;

				if (isNaN(min) || isNaN(max) || !text) {
					return;
				}

				settingTab.plugin.settings.progressRanges.push({
					min,
					max,
					text,
				});

				// Clear inputs
				inputs[0].value = "";
				inputs[1].value = "";
				inputs[2].value = "";

				settingTab.applySettingsUpdate();
				settingTab.display();
			});
		});

	// Reset to defaults
	new Setting(containerEl)
		.setName(t("Reset to defaults"))
		.setDesc(t("Reset progress ranges to default values"))
		.addButton((button) => {
			button.setButtonText(t("Reset")).onClick(async () => {
				settingTab.plugin.settings.progressRanges = [
					{
						min: 0,
						max: 20,
						text: t("Just started {{PROGRESS}}%"),
					},
					{
						min: 20,
						max: 40,
						text: t("Making progress {{PROGRESS}}%"),
					},
					{ min: 40, max: 60, text: t("Half way {{PROGRESS}}%") },
					{
						min: 60,
						max: 80,
						text: t("Good progress {{PROGRESS}}%"),
					},
					{
						min: 80,
						max: 100,
						text: t("Almost there {{PROGRESS}}%"),
					},
				];
				settingTab.applySettingsUpdate();
				settingTab.display();
			});
		});
}

function updateFormatPreview(
	settingTab: TaskProgressBarSettingTab,
	containerEl: HTMLElement,
	formatText: string
): void {
	const previewContainer = containerEl.querySelector(
		".custom-format-preview-content"
	);
	if (!previewContainer) return;

	// 创建示例数据
	const sampleData = {
		completed: 3,
		total: 5,
		inProgress: 1,
		abandoned: 0,
		notStarted: 0,
		planned: 1,
		percentages: {
			completed: 60,
			inProgress: 20,
			abandoned: 0,
			notStarted: 0,
			planned: 20,
		},
	};

	try {
		const renderedText = renderFormatPreview(
			settingTab,
			formatText,
			sampleData
		);
		previewContainer.setText(renderedText);
		previewContainer.removeClass("custom-format-preview-error");
	} catch (error) {
		previewContainer.setText("Error rendering format");
		previewContainer.addClass("custom-format-preview-error");
	}
}

// 添加渲染格式文本的辅助方法
function renderFormatPreview(
	settingTab: TaskProgressBarSettingTab,
	formatText: string,
	sampleData: any
): string {
	try {
		// 保存原始的customFormat值
		const originalFormat = settingTab.plugin.settings.customFormat;

		// 临时设置customFormat为我们要预览的格式
		settingTab.plugin.settings.customFormat = formatText;

		// 使用插件的formatProgressText函数计算预览
		const result = formatProgressText(sampleData, settingTab.plugin);

		// 恢复原始的customFormat值
		settingTab.plugin.settings.customFormat = originalFormat;

		return result;
	} catch (error) {
		console.error("Error in renderFormatPreview:", error);
		throw error;
	}
}
