import { Component, setIcon } from "obsidian";
import { WorkflowDefinition, WorkflowStage } from "../common/setting-definition";
import TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";

/**
 * Workflow progress indicator component for visualizing workflow completion
 */
export class WorkflowProgressIndicator extends Component {
	private containerEl: HTMLElement;
	private plugin: TaskProgressBarPlugin;
	private workflow: WorkflowDefinition;
	private currentStageId: string;
	private completedStages: string[] = [];

	constructor(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		workflow: WorkflowDefinition,
		currentStageId: string,
		completedStages: string[] = []
	) {
		super();
		this.containerEl = containerEl;
		this.plugin = plugin;
		this.workflow = workflow;
		this.currentStageId = currentStageId;
		this.completedStages = completedStages;
	}

	onload() {
		this.render();
	}

	onunload() {
		this.containerEl.empty();
	}

	/**
	 * Updates the progress indicator with new stage information
	 */
	updateProgress(currentStageId: string, completedStages: string[] = []) {
		this.currentStageId = currentStageId;
		this.completedStages = completedStages;
		this.render();
	}

	/**
	 * Renders the workflow progress indicator
	 */
	private render() {
		this.containerEl.empty();
		this.containerEl.addClass("workflow-progress-indicator");

		// Create header
		const header = this.containerEl.createDiv({ cls: "workflow-progress-header" });
		header.createSpan({ cls: "workflow-name", text: this.workflow.name });
		
		const progressText = this.getProgressText();
		header.createSpan({ cls: "workflow-progress-text", text: progressText });

		// Create progress bar
		this.createProgressBar();

		// Create stage list
		this.createStageList();
	}

	/**
	 * Creates the visual progress bar
	 */
	private createProgressBar() {
		const progressContainer = this.containerEl.createDiv({ cls: "workflow-progress-bar-container" });
		const progressBar = progressContainer.createDiv({ cls: "workflow-progress-bar" });

		const totalStages = this.workflow.stages.length;
		const completedCount = this.completedStages.length;
		const currentStageIndex = this.workflow.stages.findIndex(stage => stage.id === this.currentStageId);
		
		// Calculate progress percentage
		let progressPercentage = 0;
		if (totalStages > 0) {
			// Count completed stages plus partial progress for current stage
			progressPercentage = (completedCount / totalStages) * 100;
			
			// Add partial progress for current stage if it's not completed
			if (currentStageIndex >= 0 && !this.completedStages.includes(this.currentStageId)) {
				progressPercentage += (1 / totalStages) * 50; // 50% progress for current stage
			}
		}

		const progressFill = progressBar.createDiv({ cls: "workflow-progress-fill" });
		progressFill.style.width = `${Math.min(progressPercentage, 100)}%`;

		// Add progress percentage text
		progressContainer.createSpan({ 
			cls: "workflow-progress-percentage", 
			text: `${Math.round(progressPercentage)}%` 
		});
	}

	/**
	 * Creates the detailed stage list
	 */
	private createStageList() {
		const stageListContainer = this.containerEl.createDiv({ cls: "workflow-stage-list" });

		this.workflow.stages.forEach((stage, index) => {
			const stageItem = stageListContainer.createDiv({ cls: "workflow-stage-item" });
			
			// Determine stage status
			const isCompleted = this.completedStages.includes(stage.id);
			const isCurrent = stage.id === this.currentStageId;
			const isPending = !isCompleted && !isCurrent;

			// Add status classes
			if (isCompleted) stageItem.addClass("completed");
			if (isCurrent) stageItem.addClass("current");
			if (isPending) stageItem.addClass("pending");

			// Create stage icon
			const stageIcon = stageItem.createDiv({ cls: "workflow-stage-icon" });
			this.setStageIcon(stageIcon, stage, isCompleted, isCurrent);

			// Create stage content
			const stageContent = stageItem.createDiv({ cls: "workflow-stage-content" });
			
			const stageName = stageContent.createDiv({ cls: "workflow-stage-name" });
			stageName.textContent = stage.name;

			// Add stage type indicator
			const stageType = stageContent.createDiv({ cls: "workflow-stage-type" });
			stageType.textContent = this.getStageTypeText(stage);

			// Add substages if they exist and stage is current
			if (isCurrent && stage.subStages && stage.subStages.length > 0) {
				this.createSubStageList(stageContent, stage);
			}

			// Add stage number
			const stageNumber = stageItem.createDiv({ cls: "workflow-stage-number" });
			stageNumber.textContent = (index + 1).toString();
		});
	}

	/**
	 * Creates substage list for cycle stages
	 */
	private createSubStageList(container: HTMLElement, stage: WorkflowStage) {
		if (!stage.subStages) return;

		const subStageContainer = container.createDiv({ cls: "workflow-substage-container" });
		
		stage.subStages.forEach((subStage) => {
			const subStageItem = subStageContainer.createDiv({ cls: "workflow-substage-item" });
			
			const subStageIcon = subStageItem.createDiv({ cls: "workflow-substage-icon" });
			setIcon(subStageIcon, "circle");
			
			const subStageName = subStageItem.createDiv({ cls: "workflow-substage-name" });
			subStageName.textContent = subStage.name;
		});
	}

	/**
	 * Sets the appropriate icon for a stage based on its status
	 */
	private setStageIcon(iconEl: HTMLElement, stage: WorkflowStage, isCompleted: boolean, isCurrent: boolean) {
		if (isCompleted) {
			setIcon(iconEl, "check-circle");
			iconEl.addClass("completed-icon");
		} else if (isCurrent) {
			if (stage.type === "cycle") {
				setIcon(iconEl, "rotate-cw");
			} else if (stage.type === "terminal") {
				setIcon(iconEl, "flag");
			} else {
				setIcon(iconEl, "play-circle");
			}
			iconEl.addClass("current-icon");
		} else {
			setIcon(iconEl, "circle");
			iconEl.addClass("pending-icon");
		}
	}

	/**
	 * Gets the display text for stage type
	 */
	private getStageTypeText(stage: WorkflowStage): string {
		switch (stage.type) {
			case "cycle":
				return t("Repeatable");
			case "terminal":
				return t("Final");
			case "linear":
			default:
				return t("Sequential");
		}
	}

	/**
	 * Gets the progress text summary
	 */
	private getProgressText(): string {
		const totalStages = this.workflow.stages.length;
		const completedCount = this.completedStages.length;
		const currentStage = this.workflow.stages.find(stage => stage.id === this.currentStageId);
		
		if (completedCount === totalStages) {
			return t("Completed");
		} else if (currentStage) {
			return t("Current: ") + currentStage.name;
		} else {
			return `${completedCount}/${totalStages} ${t("completed")}`;
		}
	}

	/**
	 * Static method to create and render a workflow progress indicator
	 */
	static create(
		containerEl: HTMLElement,
		plugin: TaskProgressBarPlugin,
		workflow: WorkflowDefinition,
		currentStageId: string,
		completedStages: string[] = []
	): WorkflowProgressIndicator {
		const indicator = new WorkflowProgressIndicator(
			containerEl,
			plugin,
			workflow,
			currentStageId,
			completedStages
		);
		indicator.load();
		return indicator;
	}

	/**
	 * Calculates completed stages from a workflow task hierarchy
	 */
	static calculateCompletedStages(
		workflowTasks: Array<{ stage: string; completed: boolean }>,
		workflow: WorkflowDefinition
	): string[] {
		const completed: string[] = [];
		
		// Simple heuristic: a stage is completed if all its tasks are completed
		const stageTaskCounts = new Map<string, { total: number; completed: number }>();
		
		workflowTasks.forEach(task => {
			const current = stageTaskCounts.get(task.stage) || { total: 0, completed: 0 };
			current.total++;
			if (task.completed) {
				current.completed++;
			}
			stageTaskCounts.set(task.stage, current);
		});

		stageTaskCounts.forEach((counts, stageId) => {
			if (counts.completed === counts.total && counts.total > 0) {
				completed.push(stageId);
			}
		});

		return completed;
	}
}
