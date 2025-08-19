import type TaskProgressBarPlugin from "../index";
import { TaskProgressBarSettings, DEFAULT_SETTINGS } from "../common/setting-definition";
import { t } from "../translations/helper";

/**
 * Service to detect if user has made changes to plugin settings
 * Used to determine if onboarding should be offered
 */
export class SettingsChangeDetector {
	private plugin: TaskProgressBarPlugin;

	constructor(plugin: TaskProgressBarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Check if user has made significant changes to settings that would indicate
	 * they have already configured the plugin
	 */
	hasUserMadeChanges(): boolean {
		const current = this.plugin.settings;
		const defaults = DEFAULT_SETTINGS;

		// Check for significant configuration changes
		const significantChanges = [
			// Custom views added
			this.hasCustomViews(current),
			
			// Progress bar settings changed
			this.isProgressBarCustomized(current, defaults),
			
			// Task status settings changed
			this.isTaskStatusCustomized(current, defaults),
			
			// Quick capture configured differently
			this.isQuickCaptureCustomized(current, defaults),
			
			// Workflow settings changed
			this.isWorkflowCustomized(current, defaults),
			
			// Advanced features enabled
			this.areAdvancedFeaturesEnabled(current, defaults),
			
			// File parsing customized
			this.isFileParsingCustomized(current, defaults),
		];

		return significantChanges.some(changed => changed);
	}

	/**
	 * Get a summary of what changes the user has made
	 */
	getChangesSummary(): string[] {
		const changes: string[] = [];
		const current = this.plugin.settings;
		const defaults = DEFAULT_SETTINGS;

		if (this.hasCustomViews(current)) {
			const customViewCount = current.viewConfiguration?.filter(v => v.type === 'custom').length || 0;
			changes.push(t("Custom views created") + ` (${customViewCount})`);
		}

		if (this.isProgressBarCustomized(current, defaults)) {
			changes.push(t("Progress bar settings modified"));
		}

		if (this.isTaskStatusCustomized(current, defaults)) {
			changes.push(t("Task status settings configured"));
		}

		if (this.isQuickCaptureCustomized(current, defaults)) {
			changes.push(t("Quick capture configured"));
		}

		if (this.isWorkflowCustomized(current, defaults)) {
			changes.push(t("Workflow settings enabled"));
		}

		if (this.areAdvancedFeaturesEnabled(current, defaults)) {
			changes.push(t("Advanced features enabled"));
		}

		if (this.isFileParsingCustomized(current, defaults)) {
			changes.push(t("File parsing customized"));
		}

		return changes;
	}

	/**
	 * Check if user has created custom views
	 */
	private hasCustomViews(settings: TaskProgressBarSettings): boolean {
		return settings.viewConfiguration?.some(view => view.type === 'custom') ?? false;
	}

	/**
	 * Check if progress bar settings have been customized
	 */
	private isProgressBarCustomized(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		return (
			current.progressBarDisplayMode !== defaults.progressBarDisplayMode ||
			current.displayMode !== defaults.displayMode ||
			current.showPercentage !== defaults.showPercentage ||
			current.customizeProgressRanges !== defaults.customizeProgressRanges ||
			current.allowCustomProgressGoal !== defaults.allowCustomProgressGoal ||
			current.hideProgressBarBasedOnConditions !== defaults.hideProgressBarBasedOnConditions
		);
	}

	/**
	 * Check if task status settings have been customized
	 */
	private isTaskStatusCustomized(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		return (
			current.enableTaskStatusSwitcher !== defaults.enableTaskStatusSwitcher ||
			current.enableCustomTaskMarks !== defaults.enableCustomTaskMarks ||
			current.enableCycleCompleteStatus !== defaults.enableCycleCompleteStatus
		);
	}

	/**
	 * Check if quick capture has been customized
	 */
	private isQuickCaptureCustomized(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		const currentQC = current.quickCapture || defaults.quickCapture;
		const defaultQC = defaults.quickCapture;
		
		return (
			currentQC.enableQuickCapture !== defaultQC.enableQuickCapture ||
			currentQC.enableMinimalMode !== defaultQC.enableMinimalMode
		);
	}

	/**
	 * Check if workflow has been customized
	 */
	private isWorkflowCustomized(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		const currentWF = current.workflow || defaults.workflow;
		const defaultWF = defaults.workflow;
		
		return (
			currentWF.enableWorkflow !== defaultWF.enableWorkflow ||
			currentWF.autoAddTimestamp !== defaultWF.autoAddTimestamp ||
			currentWF.calculateSpentTime !== defaultWF.calculateSpentTime
		);
	}

	/**
	 * Check if advanced features are enabled
	 */
	private areAdvancedFeaturesEnabled(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		return (
			current.rewards?.enableRewards !== defaults.rewards?.enableRewards ||
			current.habit?.enableHabits !== defaults.habit?.enableHabits ||
			current.timelineSidebar?.enableTimelineSidebar !== defaults.timelineSidebar?.enableTimelineSidebar ||
			current.betaTest?.enableBaseView !== defaults.betaTest?.enableBaseView
		);
	}

	/**
	 * Check if file parsing has been customized
	 */
	private isFileParsingCustomized(current: TaskProgressBarSettings, defaults: TaskProgressBarSettings): boolean {
		const currentFP = current.fileParsingConfig || defaults.fileParsingConfig;
		const defaultFP = defaults.fileParsingConfig;
		
		return (
			currentFP.enableWorkerProcessing !== defaultFP.enableWorkerProcessing ||
			currentFP.enableFileMetadataParsing !== defaultFP.enableFileMetadataParsing ||
			currentFP.enableTagBasedTaskParsing !== defaultFP.enableTagBasedTaskParsing ||
			currentFP.enableMtimeOptimization !== defaultFP.enableMtimeOptimization
		);
	}

	/**
	 * Create a settings snapshot for later comparison
	 */
	createSettingsSnapshot(): string {
		const snapshot = {
			customViewCount: this.plugin.settings.viewConfiguration?.filter(v => v.type === 'custom').length || 0,
			progressBarMode: this.plugin.settings.progressBarDisplayMode,
			taskStatusEnabled: this.plugin.settings.enableTaskStatusSwitcher,
			quickCaptureEnabled: this.plugin.settings.quickCapture?.enableQuickCapture,
			workflowEnabled: this.plugin.settings.workflow?.enableWorkflow,
			rewardsEnabled: this.plugin.settings.rewards?.enableRewards,
			habitsEnabled: this.plugin.settings.habit?.enableHabits,
			workerProcessingEnabled: this.plugin.settings.fileParsingConfig?.enableWorkerProcessing,
			timestamp: Date.now()
		};
		
		return JSON.stringify(snapshot);
	}

	/**
	 * Compare current settings with a snapshot to detect changes
	 */
	hasChangedSinceSnapshot(snapshot: string): boolean {
		try {
			const oldSnapshot = JSON.parse(snapshot);
			const currentSnapshot = JSON.parse(this.createSettingsSnapshot());
			
			// Compare key fields (excluding timestamp)
			const fieldsToCompare = [
				'customViewCount', 'progressBarMode', 'taskStatusEnabled',
				'quickCaptureEnabled', 'workflowEnabled', 'rewardsEnabled',
				'habitsEnabled', 'workerProcessingEnabled'
			];
			
			return fieldsToCompare.some(field => oldSnapshot[field] !== currentSnapshot[field]);
		} catch (error) {
			console.warn("Failed to compare settings snapshot:", error);
			return true; // Assume changes if we can't compare
		}
	}
}