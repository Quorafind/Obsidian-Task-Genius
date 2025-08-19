import TaskProgressBarPlugin from "../index";
import {
	Component,
	debounce,
	MarkdownPostProcessorContext,
	MarkdownSectionInformation,
	TFile,
} from "obsidian";
import { shouldHideProgressBarInPreview } from "../utils";
import { formatProgressText } from "../editor-extensions/ui-widgets/progress-bar-widget";
import {
	checkIfParentElementHasGoalFormat,
	extractTaskAndGoalInfoReadMode,
	getCustomTotalGoalReadMode,
} from "../core/goal/read-mode";

interface GroupElement {
	parentElement: HTMLElement;
	childrenElement: HTMLElement[];
}

function groupElementsByParent(childrenElements: HTMLElement[]) {
	const parentMap = new Map();

	childrenElements.forEach((child: HTMLElement) => {
		const parent = child.parentElement;

		if (parent) {
			if (parentMap.has(parent)) {
				parentMap.get(parent).push(child);
			} else {
				parentMap.set(parent, [child]);
			}
		}
	});

	const result: GroupElement[] = [];
	parentMap.forEach((children, parent) => {
		result.push({ parentElement: parent, childrenElement: children });
	});
	return result;
}

// Group tasks by their heading sections
function groupTasksByHeading(
	element: HTMLElement
): Map<HTMLElement | null, HTMLElement[]> {
	const taskItems = element.findAll(".task-list-item");
	const headings = element.findAll("h1, h2, h3, h4, h5, h6");
	const tasksByHeading = new Map<HTMLElement | null, HTMLElement[]>();

	// Initialize with an entry for tasks not under any heading
	tasksByHeading.set(null, []);

	// If no headings, return all tasks as not under any heading
	if (headings.length === 0) {
		tasksByHeading.set(null, taskItems);
		return tasksByHeading;
	}

	// Group tasks by their preceding heading
	let currentHeading: HTMLElement | null = null;

	// Sort all elements (headings and tasks) by their position in the document
	const allElements = [...headings, ...taskItems].sort((a, b) => {
		const posA = a.getBoundingClientRect().top;
		const posB = b.getBoundingClientRect().top;
		return posA - posB;
	});

	for (const el of allElements) {
		if (el.matches("h1, h2, h3, h4, h5, h6")) {
			currentHeading = el;
			// Initialize array for this heading if not already done
			if (!tasksByHeading.has(currentHeading)) {
				tasksByHeading.set(currentHeading, []);
			}
		} else if (el.matches(".task-list-item")) {
			// Add task to its heading group
			tasksByHeading.get(currentHeading)?.push(el);
		}
	}

	return tasksByHeading;
}

function loadProgressbar(
	plugin: TaskProgressBarPlugin,
	groupedElements: GroupElement[],
	type: "dataview" | "normal"
) {
	for (let group of groupedElements) {
		if (
			group.parentElement.parentElement &&
			group.parentElement?.parentElement.hasClass("task-list-item")
		) {
			const progressBar = new ProgressBar(plugin, group, type).onload();

			const previousSibling = group.parentElement.previousElementSibling;
			if (previousSibling && previousSibling.tagName === "P") {
				// @ts-ignore
				if (plugin.app.plugins.getPlugin("dataview")?._loaded) {
					group.parentElement.parentElement.insertBefore(
						progressBar,
						group.parentElement
					);
				} else {
					previousSibling.appendChild(progressBar);
				}
			} else {
				group.parentElement.parentElement.insertBefore(
					progressBar,
					group.parentElement
				);
			}
		}
	}
}

// Add progress bars to headings
function addHeadingProgressBars(
	plugin: TaskProgressBarPlugin,
	tasksByHeading: Map<HTMLElement | null, HTMLElement[]>,
	type: "dataview" | "normal"
) {
	if (!plugin.settings.addTaskProgressBarToHeading) return;
	tasksByHeading.forEach((tasks, heading) => {
		// Skip if heading is null or tasks array is empty
		if (!heading || tasks.length === 0) return;

		// Create a group element structure for the progress bar
		const group: GroupElement = {
			parentElement: heading,
			childrenElement: tasks,
		};

		// Create and append the progress bar to the heading
		const progressBar = new ProgressBar(plugin, group, type).onload();
		heading.appendChild(progressBar);
	});
}

export function updateProgressBarInElement({
	plugin,
	element,
	ctx,
}: {
	plugin: TaskProgressBarPlugin;
	element: HTMLElement;
	ctx: MarkdownPostProcessorContext;
}) {
	// Check if progress bars should be hidden based on settings
	if (shouldHideProgressBarInPreview(plugin, ctx)) {
		return;
	}

	// 检查是否需要根据heading显示progress bar
	if (plugin.settings.showProgressBarBasedOnHeading?.trim()) {
		const sectionInfo = ctx.getSectionInfo(element);
		console.log(sectionInfo);
		if (sectionInfo) {
			// Read the original text to get the content of the current section
			const lines = sectionInfo.text.split("\n");

			// Find the nearest heading above the section start line
			let nearestHeadingText = null;
			let nearestHeadingPos = -1;

			// Find the nearest heading above the section start line
			for (let i = sectionInfo.lineStart; i >= 0; i--) {
				const line = lines[i];
				const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
				if (headingMatch) {
					nearestHeadingText = line.trim();
					nearestHeadingPos = i;
					break;
				}
			}

			// If there is a heading, check if it is in the showProgressBarBasedOnHeading list
			if (nearestHeadingText) {
				const allowedHeadings =
					plugin.settings.showProgressBarBasedOnHeading
						.split(",")
						.map((h) => h.trim());
				if (!allowedHeadings.includes(nearestHeadingText)) {
					// Not in the allowed heading list, add no-progress-bar class
					element.addClass("no-progress-bar");
					return;
				}
			} else {
				element.addClass("no-progress-bar");
			}
		}
	}

	// Handle heading elements directly
	if (
		plugin.settings.addTaskProgressBarToHeading &&
		element.children[0] &&
		element.children[0].matches("h1, h2, h3, h4, h5, h6")
	) {
		// Skip if this heading already has a progress bar
		if (element.find(".cm-task-progress-bar")) {
			return;
		}

		// Get section info for this heading
		const sectionInfo = ctx.getSectionInfo(element);
		if (sectionInfo) {
			// Parse the section text to find tasks
			// Get text from the section start line until the next heading of same level or higher

			const lines = sectionInfo.text.split("\n");
			const sectionLines: string[] = [];

			const headingText = lines[sectionInfo.lineStart];
			const headingLevel = headingText.match(/^(#{1,6})\s/);

			if (!headingLevel) {
				return;
			}

			const headingNumber = headingLevel[1].length;

			// Start from the heading line and collect all lines until next heading of same or higher level
			let inSection = false;
			for (const line of lines.slice(sectionInfo.lineStart)) {
				// Check if this is a heading line
				const headingMatch = line.match(/^(#{1,6})\s/);

				if (headingMatch) {
					const currentHeadingLevel = headingMatch[1].length;

					// If we're already in the section and find a heading of same or higher level, stop
					if (inSection && currentHeadingLevel <= headingNumber) {
						break;
					}
				}

				// Start collecting after we've seen the initial heading
				if (!inSection) {
					inSection = true;
				}

				sectionLines.push(line);
			}

			// 如果开启了showProgressBarBasedOnHeading设置，检查heading是否在设置列表中
			if (plugin.settings.showProgressBarBasedOnHeading?.trim()) {
				const allowedHeadings =
					plugin.settings.showProgressBarBasedOnHeading
						.split(",")
						.map((h) => h.trim());
				if (!allowedHeadings.includes(headingText.trim())) {
					// 不在允许的heading列表中，添加no-progress-bar类
					element.addClass("no-progress-bar");
					return;
				}
			}

			// Filter for task lines
			const taskLines = sectionLines.filter((line) => {
				const trimmed = line.trim();
				// Match both - [ ] and * [ ] task formats
				return trimmed.match(/^([-*+]|\\d+\\.)\s*\[(.)\]/) !== null;
			});

			if (taskLines.length > 0) {
				// Create a virtual task list for processing
				const taskElements: HTMLElement[] = [];

				// Create task list items for each task found
				for (const taskLine of taskLines) {
					const taskEl = createEl("li", { cls: "task-list-item" });

					// Extract the task mark to properly set data-task attribute
					const markMatch = taskLine.match(/\[(.)\]/);
					if (markMatch && markMatch[1]) {
						const mark = markMatch[1];
						taskEl.setAttribute("data-task", mark);

						// Create a checkbox element for proper structure
						const checkbox = createEl("input", {
							cls: "task-list-item-checkbox",
							type: "checkbox",
						}) as HTMLInputElement;

						// Set checkbox checked state based on completion mark
						const completedMarks =
							plugin.settings.taskStatuses.completed.split("|");
						if (completedMarks.includes(mark)) {
							checkbox.checked = true;
						}

						taskEl.prepend(checkbox);
					}

					// Extract the task text (everything after the checkbox)
					const taskText = taskLine.replace(
						/^([-*+]|\\d+\\.)\s*\[(.)\]\s*/,
						""
					);
					taskEl.appendChild(createSpan({ text: taskText }));
					taskElements.push(taskEl);
				}

				// Create group structure for the progress bar
				const group: GroupElement = {
					parentElement: element.children[0] as HTMLElement,
					childrenElement: taskElements,
				};

				// Create and append the progress bar
				const progressBar = new ProgressBar(plugin, group, "normal", {
					sectionInfo: sectionInfo,
					ctx: ctx,
					element: element,
				}).onload();
				element.children[0].appendChild(progressBar);
			}
		}
	}

	// Process task lists (original logic)
	if (element.find("ul.contains-task-list")) {
		const elements = element.findAll(".task-list-item");
		const groupedElements = groupElementsByParent(elements);
		loadProgressbar(plugin, groupedElements, "normal");

		// Add heading progress bars if enabled in settings
		if (plugin.settings.addTaskProgressBarToHeading) {
			const tasksByHeading = groupTasksByHeading(element);
			addHeadingProgressBars(plugin, tasksByHeading, "normal");
		}
	}
	// Process ordered lists with tasks
	else if (element.find("ol.contains-task-list")) {
		const elements = element.findAll(".task-list-item");
		const groupedElements = groupElementsByParent(elements);
		loadProgressbar(plugin, groupedElements, "normal");

		// Add heading progress bars if enabled in settings
		if (plugin.settings.addTaskProgressBarToHeading) {
			const tasksByHeading = groupTasksByHeading(element);
			addHeadingProgressBars(plugin, tasksByHeading, "normal");
		}
	} else if (element.closest(".dataview-container")) {
		const parentElement = element.closest(".dataview-container");
		if (!parentElement) return;
		if (parentElement.getAttribute("data-task-progress-bar") === "true")
			return;
		const elements = parentElement.findAll(".task-list-item");
		const groupedElements = groupElementsByParent(elements);
		loadProgressbar(plugin, groupedElements, "dataview");

		// Add heading progress bars if enabled in settings
		if (plugin.settings.addTaskProgressBarToHeading) {
			const tasksByHeading = groupTasksByHeading(
				parentElement as HTMLElement
			);
			addHeadingProgressBars(plugin, tasksByHeading, "dataview");
		}

		parentElement.setAttribute("data-task-progress-bar", "true");
	}
}

class ProgressBar extends Component {
	progressBarEl: HTMLSpanElement;
	progressBackGroundEl: HTMLDivElement;
	progressEl: HTMLDivElement;
	inProgressEl: HTMLDivElement;
	abandonedEl: HTMLDivElement;
	plannedEl: HTMLDivElement;
	numberEl: HTMLDivElement;

	plugin: TaskProgressBarPlugin;

	completed: number;
	total: number;
	inProgress: number;
	abandoned: number;
	notStarted: number;
	planned: number;

	group: GroupElement;
	info?: {
		sectionInfo?: MarkdownSectionInformation;
		ctx?: MarkdownPostProcessorContext;
		element?: HTMLElement;
	};

	constructor(
		plugin: TaskProgressBarPlugin,
		group: GroupElement,
		readonly type: "dataview" | "normal",
		info?: {
			sectionInfo?: MarkdownSectionInformation;
			ctx?: MarkdownPostProcessorContext;
			element?: HTMLElement;
		}
	) {
		super();
		this.plugin = plugin;
		this.group = group;
		this.info = info;

		this.completed = 0;
		this.total = 0;
		this.inProgress = 0;
		this.abandoned = 0;
		this.notStarted = 0;
		this.planned = 0;

		if (type === "dataview") {
			this.updateCompletedAndTotalDataview();
		} else {
			this.updateCompletedAndTotal();
		}

		// Set up event handlers
		for (let el of this.group.childrenElement) {
			if (this.type === "normal") {
				el.on("click", "input", () => {
					setTimeout(() => {
						// Update this progress bar
						this.updateCompletedAndTotal();
						this.changePercentage();
						this.changeNumber();

						// If this is a heading progress bar, we need to refresh the entire view
						// to update all related task progress bars
						if (
							this.group.parentElement.matches(
								"h1, h2, h3, h4, h5, h6"
							)
						) {
							const container = this.group.parentElement.closest(
								".markdown-reading-view"
							) as HTMLElement;
							if (container) {
								// Force refresh of the view by triggering a layout change
								container.hide();
								setTimeout(() => {
									container.show();
								}, 10);
							}
						}
					}, 200);
				});
			} else if (this.type === "dataview") {
				this.registerDomEvent(el, "mousedown", (ev) => {
					if (!ev.target) return;
					if ((ev.target as HTMLElement).tagName === "INPUT") {
						setTimeout(() => {
							// Update this progress bar
							this.updateCompletedAndTotalDataview();
							this.changePercentage();
							this.changeNumber();

							// If this is a heading progress bar, we need to refresh the entire view
							// to update all related task progress bars
							if (
								this.group.parentElement.matches(
									"h1, h2, h3, h4, h5, h6"
								)
							) {
								const container =
									this.group.parentElement.closest(
										".markdown-reading-view"
									) as HTMLElement;
								if (container) {
									// Force refresh of the view by triggering a layout change
									container.hide();
									setTimeout(() => {
										container.show();
									}, 10);
								}
							}
						}, 200);
					}
				});
			}
		}

		// Set up file monitoring
		this.setupFileMonitoring();
	}

	setupFileMonitoring() {
		if (!this.info) return;

		const infoFile = this.info.ctx?.sourcePath;
		if (!infoFile) return;

		this.registerEvent(
			this.plugin.app.vault.on("modify", (file) => {
				if (infoFile === file.path) {
					// Instead of just unloading, update the progress bar with new data
					this.debounceUpdateFromModifiedFile();
				}
			})
		);
	}

	debounceUpdateFromModifiedFile = debounce(() => {
		this.updateFromModifiedFile();
	}, 200);

	updateFromModifiedFile() {
		if (
			!this.info ||
			!this.info.ctx ||
			!this.info.element ||
			!this.info.sectionInfo
		) {
			// If missing any required info, just unload the old component
			this.unload();
			return;
		}

		const { ctx, element, sectionInfo } = this.info;

		// Get updated section info
		const updatedSectionInfo = ctx.getSectionInfo(element);
		if (!updatedSectionInfo) {
			this.unload();
			return;
		}

		// Update the stored section info
		this.info.sectionInfo = updatedSectionInfo;

		// Parse the section text to find tasks (similar to the code in updateProgressBarInElement)
		const lines = updatedSectionInfo.text.split("\n");
		const sectionLines: string[] = [];

		const headingText = lines[updatedSectionInfo.lineStart];
		const headingLevel = headingText.match(/^(#{1,6})\s/);

		if (!headingLevel) {
			this.unload();
			return;
		}

		const headingNumber = headingLevel[1].length;

		// Start from the heading line and collect all lines until next heading of same or higher level
		let inSection = false;
		for (const line of lines.slice(updatedSectionInfo.lineStart)) {
			// Check if this is a heading line
			const headingMatch = line.match(/^(#{1,6})\s/);

			if (headingMatch) {
				const currentHeadingLevel = headingMatch[1].length;

				// If we're already in the section and find a heading of same or higher level, stop
				if (inSection && currentHeadingLevel <= headingNumber) {
					break;
				}
			}

			// Start collecting after we've seen the initial heading
			if (!inSection) {
				inSection = true;
			}

			sectionLines.push(line);
		}

		// Filter for task lines
		const taskLines = sectionLines.filter((line) => {
			const trimmed = line.trim();
			// Match both - [ ] and * [ ] task formats
			return trimmed.match(/^([-*+]|\\d+\\.)\s*\[(.)\]/) !== null;
		});

		if (taskLines.length === 0) {
			// No tasks found, remove the progress bar
			this.unload();
			return;
		}

		// Create updated task elements
		const taskElements: HTMLElement[] = [];

		// Create task list items for each task found
		for (const taskLine of taskLines) {
			const taskEl = createEl("li", { cls: "task-list-item" });

			// Extract the task mark to properly set data-task attribute
			const markMatch = taskLine.match(/\[(.)\]/);
			if (markMatch && markMatch[1]) {
				const mark = markMatch[1];
				taskEl.setAttribute("data-task", mark);

				// Create a checkbox element for proper structure
				const checkbox = createEl("input", {
					cls: "task-list-item-checkbox",
					type: "checkbox",
				}) as HTMLInputElement;

				// Set checkbox checked state based on completion mark
				const completedMarks =
					this.plugin.settings.taskStatuses.completed.split("|");
				if (completedMarks.includes(mark)) {
					checkbox.checked = true;
				}

				taskEl.prepend(checkbox);
			}

			// Extract the task text (everything after the checkbox)
			const taskText = taskLine.replace(
				/^([-*+]|\\d+\\.)\s*\[(.)\]\s*/,
				""
			);
			taskEl.appendChild(createSpan({ text: taskText }));
			taskElements.push(taskEl);
		}

		// Update the group with new task elements
		this.group.childrenElement = taskElements;

		// Update progress bar stats
		this.updateCompletedAndTotal();

		// If the number of tasks with different statuses has changed,
		// we may need to recreate UI elements
		const needsUIRecreation =
			(this.inProgress > 0 && !this.inProgressEl) ||
			(this.inProgress === 0 && this.inProgressEl) ||
			(this.abandoned > 0 && !this.abandonedEl) ||
			(this.abandoned === 0 && this.abandonedEl) ||
			(this.planned > 0 && !this.plannedEl) ||
			(this.planned === 0 && this.plannedEl);

		if (needsUIRecreation) {
			// Clean up old elements
			if (this.progressBarEl && this.progressBarEl.parentElement) {
				const parent = this.progressBarEl.parentElement;
				// this.progressBarEl.remove();
				this.progressBarEl?.detach();
				// Unload the current component to ensure proper cleanup
				this.onunload();
				// Create new progress bar
				const newProgressBar = this.onload();
				// Remove old element after unloading
				this.progressBarEl.remove();
				parent.appendChild(newProgressBar);

				if (
					this.plugin?.settings.progressBarDisplayMode === "text" ||
					this.plugin?.settings.progressBarDisplayMode === "none"
				) {
					this.progressBackGroundEl.hide();
				}
			}
		} else {
			// Just update values on existing elements
			this.changePercentage();
			this.changeNumber();
		}
	}

	getTaskStatusFromDataTask(
		dataTask: string
	): "completed" | "inProgress" | "abandoned" | "planned" | "notStarted" {
		// Priority 1: If useOnlyCountMarks is enabled
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks.split("|");
			if (onlyCountMarks.includes(dataTask)) {
				return "completed";
			} else {
				// If using onlyCountMarks and the mark is not in the list,
				// determine which other status it belongs to
				return this.determineNonCompletedStatusFromDataTask(dataTask);
			}
		}

		// Priority 2: If the mark is in excludeTaskMarks
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(dataTask)
		) {
			// Excluded marks are considered not started
			return "notStarted";
		}

		// Priority 3: Check against specific task statuses
		return this.determineTaskStatusFromDataTask(dataTask);
	}

	getTaskStatus(
		text: string
	): "completed" | "inProgress" | "abandoned" | "planned" | "notStarted" {
		const markMatch = text.match(/\[(.)]/);
		if (!markMatch || !markMatch[1]) {
			return "notStarted";
		}

		const mark = markMatch[1];

		// Priority 1: If useOnlyCountMarks is enabled
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks.split("|");
			if (onlyCountMarks.includes(mark)) {
				return "completed";
			} else {
				// If using onlyCountMarks and the mark is not in the list,
				// determine which other status it belongs to
				return this.determineNonCompletedStatus(mark);
			}
		}

		// Priority 2: If the mark is in excludeTaskMarks
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(mark)
		) {
			// Excluded marks are considered not started
			return "notStarted";
		}

		// Priority 3: Check against specific task statuses
		return this.determineTaskStatus(mark);
	}

	determineNonCompletedStatusFromDataTask(
		dataTask: string
	): "inProgress" | "abandoned" | "planned" | "notStarted" {
		const inProgressMarks =
			this.plugin?.settings.taskStatuses.inProgress?.split("|") || [
				"-",
				"/",
			];
		if (inProgressMarks.includes(dataTask)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses.abandoned?.split("|") || [">"];
		if (abandonedMarks.includes(dataTask)) {
			return "abandoned";
		}

		const plannedMarks = this.plugin?.settings.taskStatuses.planned?.split(
			"|"
		) || ["?"];
		if (plannedMarks.includes(dataTask)) {
			return "planned";
		}

		// If the mark doesn't match any specific category, use the countOtherStatusesAs setting
		return (
			(this.plugin?.settings.countOtherStatusesAs as
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned") || "notStarted"
		);
	}

	determineNonCompletedStatus(
		mark: string
	): "inProgress" | "abandoned" | "planned" | "notStarted" {
		const inProgressMarks =
			this.plugin?.settings.taskStatuses.inProgress?.split("|") || [
				"-",
				"/",
			];
		if (inProgressMarks.includes(mark)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses.abandoned?.split("|") || [">"];
		if (abandonedMarks.includes(mark)) {
			return "abandoned";
		}

		const plannedMarks = this.plugin?.settings.taskStatuses.planned?.split(
			"|"
		) || ["?"];
		if (plannedMarks.includes(mark)) {
			return "planned";
		}

		// If the mark doesn't match any specific category, use the countOtherStatusesAs setting
		return (
			(this.plugin?.settings.countOtherStatusesAs as
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned") || "notStarted"
		);
	}

	determineTaskStatusFromDataTask(
		dataTask: string
	): "completed" | "inProgress" | "abandoned" | "planned" | "notStarted" {
		const completedMarks =
			this.plugin?.settings.taskStatuses.completed?.split("|") || [
				"x",
				"X",
			];
		if (completedMarks.includes(dataTask)) {
			return "completed";
		}

		const inProgressMarks =
			this.plugin?.settings.taskStatuses.inProgress?.split("|") || [
				"-",
				"/",
			];

		if (inProgressMarks.includes(dataTask)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses.abandoned?.split("|") || [">"];
		if (abandonedMarks.includes(dataTask)) {
			return "abandoned";
		}

		const plannedMarks = this.plugin?.settings.taskStatuses.planned?.split(
			"|"
		) || ["?"];
		if (plannedMarks.includes(dataTask)) {
			return "planned";
		}

		// If not matching any specific status, check if it's a not-started mark
		const notStartedMarks =
			this.plugin?.settings.taskStatuses.notStarted?.split("|") || [" "];
		if (notStartedMarks.includes(dataTask)) {
			return "notStarted";
		}

		// If the mark doesn't match any specific category, use the countOtherStatusesAs setting
		return (
			(this.plugin?.settings.countOtherStatusesAs as
				| "inProgress"
				| "abandoned"
				| "notStarted"
				| "planned") || "notStarted"
		);
	}

	determineTaskStatus(
		mark: string
	): "completed" | "inProgress" | "abandoned" | "planned" | "notStarted" {
		const completedMarks =
			this.plugin?.settings.taskStatuses.completed.split("|");
		if (completedMarks.includes(mark)) {
			return "completed";
		}

		const inProgressMarks =
			this.plugin?.settings.taskStatuses.inProgress?.split("|");
		if (inProgressMarks.includes(mark)) {
			return "inProgress";
		}

		const abandonedMarks =
			this.plugin?.settings.taskStatuses.abandoned?.split("|");
		if (abandonedMarks.includes(mark)) {
			return "abandoned";
		}

		const plannedMarks =
			this.plugin?.settings.taskStatuses.planned?.split("|");
		if (plannedMarks.includes(mark)) {
			return "planned";
		}

		// If not matching any specific status, check if it's a not-started mark
		const notStartedMarks =
			this.plugin?.settings.taskStatuses.notStarted?.split("|");
		if (notStartedMarks.includes(mark)) {
			return "notStarted";
		}

		// Default fallback - any unrecognized mark is considered not started
		return "notStarted";
	}

	isCompletedTaskFromDataTask(dataTask: string): boolean {
		// Priority 1: If useOnlyCountMarks is enabled, only count tasks with specified marks
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks.split("|");
			return onlyCountMarks.includes(dataTask);
		}

		// Priority 2: If the mark is in excludeTaskMarks, don't count it
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(dataTask)
		) {
			return false;
		}

		// Priority 3: Check against the task statuses
		// We consider a task "completed" if it has a mark from the "completed" status
		const completedMarks =
			this.plugin?.settings.taskStatuses.completed.split("|");

		// Return true if the mark is in the completedMarks array
		return completedMarks.includes(dataTask);
	}

	isCompletedTask(text: string): boolean {
		const markMatch = text.match(/\[(.)]/);
		if (!markMatch || !markMatch[1]) {
			return false;
		}

		const mark = markMatch[1];

		// Priority 1: If useOnlyCountMarks is enabled, only count tasks with specified marks
		if (this.plugin?.settings.useOnlyCountMarks) {
			const onlyCountMarks =
				this.plugin?.settings.onlyCountTaskMarks.split("|");
			return onlyCountMarks.includes(mark);
		}

		// Priority 2: If the mark is in excludeTaskMarks, don't count it
		if (
			this.plugin?.settings.excludeTaskMarks &&
			this.plugin.settings.excludeTaskMarks.includes(mark)
		) {
			return false;
		}

		// Priority 3: Check against the task statuses
		// We consider a task "completed" if it has a mark from the "completed" status
		const completedMarks =
			this.plugin?.settings.taskStatuses.completed.split("|");

		// Return true if the mark is in the completedMarks array
		return completedMarks.includes(mark);
	}

	updateCompletedAndTotalDataview() {
		let completed = 0;
		let inProgress = 0;
		let abandoned = 0;
		let planned = 0;
		let notStarted = 0;
		let total = 0;

		// Get all parent-child relationships to check for indentation
		const parentChildMap = new Map<HTMLElement, HTMLElement[]>();
		for (let element of this.group.childrenElement) {
			const parent = element.parentElement;
			if (parent) {
				if (!parentChildMap.has(parent)) {
					parentChildMap.set(parent, []);
				}
				parentChildMap.get(parent)?.push(element);
			}
		}

		for (let element of this.group.childrenElement) {
			const checkboxElement = element.querySelector(
				".task-list-item-checkbox"
			);
			if (!checkboxElement) continue;

			// Skip if this is a sublevel task and countSubLevel is disabled
			if (!this.plugin?.settings.countSubLevel) {
				// Check if this task is a subtask by examining its position and parent-child relationships
				const parent = element.parentElement;
				if (parent && parent.classList.contains("task-list-item")) {
					// This is a subtask (nested under another task), so skip it
					continue;
				}

				// If this is a heading progress bar, only count top-level tasks
				if (
					this.group.parentElement.matches("h1, h2, h3, h4, h5, h6")
				) {
					// Get indentation by checking the DOM structure or task content
					const liElement = element.closest("li");
					if (liElement) {
						const parentList = liElement.parentElement;
						const grandParentListItem =
							parentList?.parentElement?.closest("li");
						if (grandParentListItem) {
							// This is a nested task, so skip it
							continue;
						}
					}
				}
			}

			total++;

			// First try to get status from data-task attribute
			const dataTask = element.getAttribute("data-task");
			if (dataTask) {
				const status = this.getTaskStatusFromDataTask(dataTask);

				if (this.isCompletedTaskFromDataTask(dataTask)) {
					completed++;
				} else if (status === "inProgress") {
					inProgress++;
				} else if (status === "abandoned") {
					abandoned++;
				} else if (status === "planned") {
					planned++;
				} else if (status === "notStarted") {
					notStarted++;
				}
			} else {
				// Fallback to the text content method
				const textContent = element.textContent?.trim() || "";
				// Extract the task mark
				const markMatch = textContent.match(/\[(.)]/);
				if (markMatch && markMatch[1]) {
					const status = this.getTaskStatus(textContent);

					// Count based on status
					if (this.isCompletedTask(textContent)) {
						completed++;
					} else if (status === "inProgress") {
						inProgress++;
					} else if (status === "abandoned") {
						abandoned++;
					} else if (status === "planned") {
						planned++;
					} else if (status === "notStarted") {
						notStarted++;
					}
				} else {
					// Fallback to checking if the checkbox is checked
					const checkbox = checkboxElement as HTMLInputElement;
					if (checkbox.checked) {
						completed++;
					} else {
						notStarted++;
					}
				}
			}
		}

		this.completed = completed;
		this.inProgress = inProgress;
		this.abandoned = abandoned;
		this.planned = planned;
		this.notStarted = notStarted;
		this.total = total;
	}
	countTasks(allTasks: HTMLElement[]) {
		let completed = 0;
		let inProgress = 0;
		let abandoned = 0;
		let planned = 0;
		let notStarted = 0;
		let total = 0;

		for (let element of allTasks) {
			// const isParentCustomGoal: boolean = checkIfParentElementHasGoalFormat(element.parentElement)
			let subTaskGoal: null | number = null;
			const useTaskGoal: boolean =
				this.plugin?.settings.allowCustomProgressGoal &&
				checkIfParentElementHasGoalFormat(
					element.parentElement?.parentElement
				);
			const checkboxElement = element.querySelector(
				".task-list-item-checkbox"
			);
			if (!checkboxElement) continue;

			// First try to get status from data-task attribute
			const dataTask = element.getAttribute("data-task");
			if (dataTask) {
				const status = this.getTaskStatusFromDataTask(dataTask);

				if (useTaskGoal)
					subTaskGoal = extractTaskAndGoalInfoReadMode(element);

				if (this.isCompletedTaskFromDataTask(dataTask)) {
					if (!useTaskGoal) completed++;
					if (subTaskGoal !== null) completed += subTaskGoal;
				} else if (status === "inProgress") {
					if (!useTaskGoal) inProgress++;
					if (useTaskGoal && subTaskGoal !== null)
						inProgress += subTaskGoal;
				} else if (status === "abandoned") {
					if (!useTaskGoal) abandoned++;
					if (useTaskGoal && subTaskGoal !== null)
						abandoned += subTaskGoal;
				} else if (status === "planned") {
					if (!useTaskGoal) planned++;
					if (useTaskGoal && subTaskGoal !== null)
						planned += subTaskGoal;
				} else if (status === "notStarted") {
					if (!useTaskGoal) notStarted++;
					if (useTaskGoal && subTaskGoal !== null)
						notStarted += subTaskGoal;
				}
			} else {
				// Fallback to the text content method
				const textContent = element.textContent?.trim() || "";
				const checkbox = checkboxElement as HTMLInputElement;

				// Extract the task mark
				const markMatch = textContent.match(/\[(.)]/);
				if (markMatch && markMatch[1]) {
					const status = this.getTaskStatus(textContent);

					// Count based on status
					if (this.isCompletedTask(textContent)) {
						completed++;
					} else if (status === "inProgress") {
						inProgress++;
					} else if (status === "abandoned") {
						abandoned++;
					} else if (status === "planned") {
						planned++;
					} else if (status === "notStarted") {
						notStarted++;
					}
				} else if (checkbox.checked) {
					completed++;
				} else {
					notStarted++;
				}
			}

			total++;
		}

		return { completed, inProgress, abandoned, planned, notStarted, total };
	}

	updateCompletedAndTotal() {
		let total = 0;

		// Get all parent-child relationships to check for indentation
		const parentChildMap = new Map<HTMLElement, HTMLElement[]>();
		for (let element of this.group.childrenElement) {
			const parent = element.parentElement;
			if (parent) {
				if (!parentChildMap.has(parent)) {
					parentChildMap.set(parent, []);
				}
				parentChildMap.get(parent)?.push(element);
			}
		}

		const allTasks: HTMLElement[] = [];

		// Check if the element is a top-level task or if countSubLevel is enabled
		for (let element of this.group.childrenElement) {
			const checkboxElement = element.querySelector(
				".task-list-item-checkbox"
			);
			// Get the parent of the current element

			if (!checkboxElement) continue;

			allTasks.push(element);

			// Skip if this is a sublevel task and countSubLevel is disabled
			if (!this.plugin?.settings.countSubLevel) {
				// Check if this task is a subtask by examining its position and parent-child relationships
				const parent = element.parentElement;
				if (parent && parent.classList.contains("task-list-item")) {
					// This is a subtask (nested under another task), so skip it
					continue;
				}

				// If this is a heading progress bar, only count top-level tasks
				if (
					this.group.parentElement.matches("h1, h2, h3, h4, h5, h6")
				) {
					// Get indentation by checking the DOM structure or task content
					const liElement = element.closest("li");
					if (liElement) {
						const parentList = liElement.parentElement;
						const grandParentListItem =
							parentList?.parentElement?.closest("li");
						if (grandParentListItem) {
							// This is a nested task, so skip it
							continue;
						}
					}
				}
			} else if (this.plugin?.settings.countSubLevel) {
				const childrenTasks = element.findAll(".task-list-item");
				for (let child of childrenTasks) {
					total++;
					allTasks.push(child);
				}
			}
			const parentGoal = getCustomTotalGoalReadMode(
				element.parentElement?.parentElement
			);
			if (parentGoal) total = parentGoal;
			else total++;

			// total++;
		}

		const { completed, inProgress, abandoned, planned, notStarted } =
			this.countTasks(allTasks);

		this.completed = completed;
		this.inProgress = inProgress;
		this.abandoned = abandoned;
		this.planned = planned;
		this.notStarted = notStarted;
		this.total = total;
	}

	changePercentage() {
		if (this.total === 0) return;

		const completedPercentage =
			Math.round((this.completed / this.total) * 10000) / 100;
		const inProgressPercentage =
			Math.round((this.inProgress / this.total) * 10000) / 100;
		const abandonedPercentage =
			Math.round((this.abandoned / this.total) * 10000) / 100;
		const plannedPercentage =
			Math.round((this.planned / this.total) * 10000) / 100;

		// Set the completed part
		this.progressEl.style.width = completedPercentage + "%";

		// Set the in-progress part (if it exists)
		if (this.inProgressEl) {
			this.inProgressEl.style.width = inProgressPercentage + "%";
			this.inProgressEl.style.left = completedPercentage + "%";
		}

		// Set the abandoned part (if it exists)
		if (this.abandonedEl) {
			this.abandonedEl.style.width = abandonedPercentage + "%";
			this.abandonedEl.style.left =
				completedPercentage + inProgressPercentage + "%";
		}

		// Set the planned part (if it exists)
		if (this.plannedEl) {
			this.plannedEl.style.width = plannedPercentage + "%";
			this.plannedEl.style.left =
				completedPercentage +
				inProgressPercentage +
				abandonedPercentage +
				"%";
		}

		// Update the class based on progress percentage
		let progressClass = "progress-bar-inline";

		switch (true) {
			case completedPercentage === 0:
				progressClass += " progress-bar-inline-empty";
				break;
			case completedPercentage > 0 && completedPercentage < 25:
				progressClass += " progress-bar-inline-0";
				break;
			case completedPercentage >= 25 && completedPercentage < 50:
				progressClass += " progress-bar-inline-1";
				break;
			case completedPercentage >= 50 && completedPercentage < 75:
				progressClass += " progress-bar-inline-2";
				break;
			case completedPercentage >= 75 && completedPercentage < 100:
				progressClass += " progress-bar-inline-3";
				break;
			case completedPercentage >= 100:
				progressClass += " progress-bar-inline-complete";
				break;
		}

		// Add classes for special states
		if (inProgressPercentage > 0) {
			progressClass += " has-in-progress";
		}
		if (abandonedPercentage > 0) {
			progressClass += " has-abandoned";
		}
		if (plannedPercentage > 0) {
			progressClass += " has-planned";
		}

		this.progressEl.className = progressClass;
	}

	changeNumber() {
		if (
			this.plugin?.settings.progressBarDisplayMode === "text" ||
			this.plugin?.settings.progressBarDisplayMode === "both"
		) {
			const text = formatProgressText(
				{
					completed: this.completed,
					total: this.total,
					inProgress: this.inProgress,
					abandoned: this.abandoned,
					notStarted: this.notStarted,
					planned: this.planned,
				},
				this.plugin
			);

			if (!this.numberEl) {
				this.numberEl = this.progressBarEl.createEl("div", {
					cls: "progress-status",
					text: text,
				});
			} else {
				this.numberEl.innerText = text;
			}
		}
	}

	onload() {
		this.progressBarEl = createSpan(
			this.plugin?.settings.progressBarDisplayMode === "both" ||
				this.plugin?.settings.progressBarDisplayMode === "text"
				? "cm-task-progress-bar with-number"
				: "cm-task-progress-bar"
		);
		this.progressBackGroundEl = this.progressBarEl.createEl("div", {
			cls: "progress-bar-inline-background",
		});

		// Create elements for each status type
		this.progressEl = this.progressBackGroundEl.createEl("div", {
			cls: "progress-bar-inline progress-completed",
		});

		// Only create these elements if we have tasks of these types
		if (this.inProgress > 0) {
			this.inProgressEl = this.progressBackGroundEl.createEl("div", {
				cls: "progress-bar-inline progress-in-progress",
			});
		}

		if (this.abandoned > 0) {
			this.abandonedEl = this.progressBackGroundEl.createEl("div", {
				cls: "progress-bar-inline progress-abandoned",
			});
		}

		if (this.planned > 0) {
			this.plannedEl = this.progressBackGroundEl.createEl("div", {
				cls: "progress-bar-inline progress-planned",
			});
		}

		if (
			this.plugin?.settings.progressBarDisplayMode === "both" ||
			this.plugin?.settings.progressBarDisplayMode === "text"
		) {
			// 使用 formatProgressText 函数生成进度文本
			const text = formatProgressText(
				{
					completed: this.completed,
					total: this.total,
					inProgress: this.inProgress,
					abandoned: this.abandoned,
					notStarted: this.notStarted,
					planned: this.planned,
				},
				this.plugin
			);

			this.numberEl = this.progressBarEl.createEl("div", {
				cls: "progress-status",
				text: text,
			});
		}

		this.changePercentage();

		if (
			this.plugin?.settings.progressBarDisplayMode === "text" ||
			this.plugin?.settings.progressBarDisplayMode === "none"
		) {
			this.progressBackGroundEl.hide();
		}

		this.plugin.addChild(this);

		return this.progressBarEl;
	}

	onunload() {
		super.onunload();
	}
}
