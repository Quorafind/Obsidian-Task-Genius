import { TaskProgressBarSettings, DEFAULT_SETTINGS, ViewConfig } from "../common/setting-definition";
import type TaskProgressBarPlugin from "../index";
import { t } from "../translations/helper";

export type OnboardingConfigMode = 'beginner' | 'advanced' | 'power';

export interface OnboardingConfig {
	mode: OnboardingConfigMode;
	name: string;
	description: string;
	features: string[];
	settings: Partial<TaskProgressBarSettings>;
}

export class OnboardingConfigManager {
	private plugin: TaskProgressBarPlugin;

	constructor(plugin: TaskProgressBarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * Get all available onboarding configuration templates
	 */
	getOnboardingConfigs(): OnboardingConfig[] {
		return [
			this.getBeginnerConfig(),
			this.getAdvancedConfig(),
			this.getPowerUserConfig()
		];
	}

	/**
	 * Get beginner configuration template
	 */
	private getBeginnerConfig(): OnboardingConfig {
		const beginnerViews: ViewConfig[] = DEFAULT_SETTINGS.viewConfiguration.filter(view => 
			['inbox', 'forecast', 'projects'].includes(view.id)
		);

		return {
			mode: 'beginner',
			name: t('Beginner'),
			description: t('Basic task management with essential features'),
			features: [
				t('Basic progress bars'),
				t('Essential views (Inbox, Forecast, Projects)'),
				t('Simple task status tracking'),
				t('Quick task capture'),
				t('Date picker functionality')
			],
			settings: {
				// Progress Bar Settings - Simple
				progressBarDisplayMode: "both",
				displayMode: "bracketFraction",
				showPercentage: false,
				customizeProgressRanges: false,
				allowCustomProgressGoal: false,
				hideProgressBarBasedOnConditions: false,

				// Task Status Settings - Basic
				enableTaskStatusSwitcher: false,
				enableCustomTaskMarks: false,
				enableCycleCompleteStatus: false,

				// Views - Essential only
				enableView: true,
				enableInlineEditor: false,
				viewConfiguration: beginnerViews,

				// Features - Minimal
				enableDatePicker: true,
				enablePriorityPicker: false,
				quickCapture: {
					...DEFAULT_SETTINGS.quickCapture,
					enableQuickCapture: true
				},

				// Disable advanced features
				workflow: {
					...DEFAULT_SETTINGS.workflow,
					enableWorkflow: false
				},
				rewards: {
					...DEFAULT_SETTINGS.rewards,
					enableRewards: false
				},
				habit: {
					...DEFAULT_SETTINGS.habit,
					enableHabits: false
				},
				fileParsingConfig: {
					...DEFAULT_SETTINGS.fileParsingConfig,
					enableWorkerProcessing: false,
					enableFileMetadataParsing: false,
					enableTagBasedTaskParsing: false
				},
				timelineSidebar: {
					...DEFAULT_SETTINGS.timelineSidebar,
					enableTimelineSidebar: false
				},
				betaTest: {
					enableBaseView: false
				}
			}
		};
	}

	/**
	 * Get advanced configuration template
	 */
	private getAdvancedConfig(): OnboardingConfig {
		const advancedViews: ViewConfig[] = DEFAULT_SETTINGS.viewConfiguration.filter(view => 
			['inbox', 'forecast', 'projects', 'tags', 'kanban', 'calendar', 'table'].includes(view.id)
		);

		return {
			mode: 'advanced',
			name: t('Advanced'),
			description: t('Project management with enhanced workflows'),
			features: [
				t('Full progress bar customization'),
				t('Extended views (Kanban, Calendar, Table)'),
				t('Project management features'),
				t('Basic workflow automation'),
				t('Task status switching'),
				t('Advanced filtering and sorting')
			],
			settings: {
				// Progress Bar Settings - Full customization
				progressBarDisplayMode: "both",
				displayMode: "bracketFraction",
				showPercentage: true,
				customizeProgressRanges: true,
				allowCustomProgressGoal: true,
				hideProgressBarBasedOnConditions: false,

				// Task Status Settings - Enhanced
				enableTaskStatusSwitcher: true,
				enableCycleCompleteStatus: true,
				enableCustomTaskMarks: false,

				// Views - Extended set
				enableView: true,
				enableInlineEditor: true,
				viewConfiguration: advancedViews,

				// Features - Intermediate
				enableDatePicker: true,
				enablePriorityPicker: true,
				quickCapture: {
					...DEFAULT_SETTINGS.quickCapture,
					enableQuickCapture: true
				},

				// Project Management
				projectConfig: {
					...DEFAULT_SETTINGS.projectConfig,
					enableEnhancedProject: true
				},
				fileMetadataInheritance: {
					...DEFAULT_SETTINGS.fileMetadataInheritance,
					enabled: true
				},

				// Basic Workflow
				workflow: {
					...DEFAULT_SETTINGS.workflow,
					enableWorkflow: true,
					autoAddTimestamp: true
				},
				autoDateManager: {
					...DEFAULT_SETTINGS.autoDateManager,
					enabled: true
				},

				// Task Management
				completedTaskMover: {
					...DEFAULT_SETTINGS.completedTaskMover,
					enableCompletedTaskMover: true
				},

				// Still disabled features
				rewards: {
					...DEFAULT_SETTINGS.rewards,
					enableRewards: false
				},
				habit: {
					...DEFAULT_SETTINGS.habit,
					enableHabits: false
				},
				fileParsingConfig: {
					...DEFAULT_SETTINGS.fileParsingConfig,
					enableWorkerProcessing: true,
					enableFileMetadataParsing: false
				},
				timelineSidebar: {
					...DEFAULT_SETTINGS.timelineSidebar,
					enableTimelineSidebar: false
				}
			}
		};
	}

	/**
	 * Get power user configuration template
	 */
	private getPowerUserConfig(): OnboardingConfig {
		return {
			mode: 'power',
			name: t('Power User'),
			description: t('Full-featured experience with all capabilities'),
			features: [
				t('All views and advanced configurations'),
				t('Complex workflow definitions'),
				t('Reward and habit tracking systems'),
				t('Performance optimizations'),
				t('Advanced integrations'),
				t('Experimental features'),
				t('Timeline and calendar sync')
			],
			settings: {
				// All progress bar features
				progressBarDisplayMode: "both",
				displayMode: "custom",
				showPercentage: true,
				customizeProgressRanges: true,
				allowCustomProgressGoal: true,
				hideProgressBarBasedOnConditions: true,

				// Advanced task status
				enableTaskStatusSwitcher: true,
				enableCustomTaskMarks: true,
				enableCycleCompleteStatus: true,

				// All views enabled
				enableView: true,
				enableInlineEditor: true,
				viewConfiguration: DEFAULT_SETTINGS.viewConfiguration,

				// All features enabled
				enableDatePicker: true,
				enablePriorityPicker: true,
				quickCapture: {
					...DEFAULT_SETTINGS.quickCapture,
					enableQuickCapture: true,
					enableMinimalMode: true
				},

				// Advanced project features
				projectConfig: {
					...DEFAULT_SETTINGS.projectConfig,
					enableEnhancedProject: true
				},
				fileMetadataInheritance: {
					...DEFAULT_SETTINGS.fileMetadataInheritance,
					enabled: true,
					inheritFromFrontmatter: true,
					inheritFromFrontmatterForSubtasks: true
				},

				// Advanced features
				workflow: {
					...DEFAULT_SETTINGS.workflow,
					enableWorkflow: true,
					autoAddTimestamp: true,
					calculateSpentTime: true
				},
				rewards: {
					...DEFAULT_SETTINGS.rewards,
					enableRewards: true
				},
				habit: {
					...DEFAULT_SETTINGS.habit,
					enableHabits: true
				},

				// Performance optimizations
				fileParsingConfig: {
					...DEFAULT_SETTINGS.fileParsingConfig,
					enableWorkerProcessing: true,
					enableFileMetadataParsing: true,
					enableTagBasedTaskParsing: true,
					enableMtimeOptimization: true
				},

				// Advanced integrations
				timelineSidebar: {
					...DEFAULT_SETTINGS.timelineSidebar,
					enableTimelineSidebar: true
				},
				autoDateManager: {
					...DEFAULT_SETTINGS.autoDateManager,
					enabled: true,
					manageCompletedDate: true,
					manageStartDate: true
				},
				completedTaskMover: {
					...DEFAULT_SETTINGS.completedTaskMover,
					enableCompletedTaskMover: true,
					enableAutoMove: true
				},

				// Beta features
				betaTest: {
					enableBaseView: true
				}
			}
		};
	}

	/**
	 * Apply configuration template to plugin settings with safe view merging
	 */
	async applyConfiguration(mode: OnboardingConfigMode): Promise<void> {
		const configs = this.getOnboardingConfigs();
		const selectedConfig = configs.find(config => config.mode === mode);

		if (!selectedConfig) {
			throw new Error(`Configuration mode ${mode} not found`);
		}

		// Preserve user's custom views before applying configuration
		const currentViews = this.plugin.settings.viewConfiguration || [];
		const userCustomViews = currentViews.filter(view => view.type === 'custom');
		const templateViews = selectedConfig.settings.viewConfiguration || [];

		// Smart merge: keep user custom views, update/add template views
		const mergedViews = this.mergeViewConfigurations(templateViews, userCustomViews);

		// Deep merge the selected configuration with current settings, excluding viewConfiguration
		const configWithoutViews = { ...selectedConfig.settings };
		delete configWithoutViews.viewConfiguration;
		
		const newSettings = this.deepMerge(this.plugin.settings, configWithoutViews);
		
		// Apply the safely merged view configuration
		newSettings.viewConfiguration = mergedViews;

		// Update onboarding status
		if (!newSettings.onboarding) {
			newSettings.onboarding = DEFAULT_SETTINGS.onboarding;
		}
		newSettings.onboarding.configMode = mode;

		// Apply new settings
		this.plugin.settings = newSettings as TaskProgressBarSettings;
		await this.plugin.saveSettings();

		console.log(`Applied ${mode} configuration template with ${userCustomViews.length} user custom views preserved`);
	}

	/**
	 * Mark onboarding as completed
	 */
	async completeOnboarding(mode: OnboardingConfigMode): Promise<void> {
		if (!this.plugin.settings.onboarding) {
			this.plugin.settings.onboarding = {...DEFAULT_SETTINGS.onboarding!};
		}

		this.plugin.settings.onboarding.completed = true;
		this.plugin.settings.onboarding.configMode = mode;
		this.plugin.settings.onboarding.completedAt = new Date().toISOString();
		this.plugin.settings.onboarding.version = this.plugin.manifest.version;

		await this.plugin.saveSettings();
		console.log(`Onboarding completed with ${mode} configuration`);
	}

	/**
	 * Check if user should see onboarding
	 */
	shouldShowOnboarding(): boolean {
		return !this.plugin.settings.onboarding?.completed && 
			   !this.plugin.settings.onboarding?.skipOnboarding;
	}

	/**
	 * Skip onboarding
	 */
	async skipOnboarding(): Promise<void> {
		if (!this.plugin.settings.onboarding) {
			this.plugin.settings.onboarding = {...DEFAULT_SETTINGS.onboarding!};
		}

		this.plugin.settings.onboarding.skipOnboarding = true;
		this.plugin.settings.onboarding.version = this.plugin.manifest.version;
		await this.plugin.saveSettings();
		console.log('Onboarding skipped');
	}

	/**
	 * Reset onboarding status (for restart functionality)
	 */
	async resetOnboarding(): Promise<void> {
		if (!this.plugin.settings.onboarding) {
			this.plugin.settings.onboarding = {...DEFAULT_SETTINGS.onboarding!};
		}

		this.plugin.settings.onboarding.completed = false;
		this.plugin.settings.onboarding.skipOnboarding = false;
		this.plugin.settings.onboarding.completedAt = "";
		await this.plugin.saveSettings();
		console.log('Onboarding reset');
	}

	/**
	 * Get current configuration mode display name
	 */
	getCurrentConfigModeDisplay(): string {
		const mode = this.plugin.settings.onboarding?.configMode;
		if (!mode) return t('Not configured');

		const configs = this.getOnboardingConfigs();
		const currentConfig = configs.find(config => config.mode === mode);
		return currentConfig ? currentConfig.name : t('Custom');
	}

	/**
	 * Merge view configurations safely, preserving user custom views
	 */
	private mergeViewConfigurations(templateViews: ViewConfig[], userCustomViews: ViewConfig[]): ViewConfig[] {
		// Start with template views (these define which default views are enabled for this mode)
		const mergedViews: ViewConfig[] = [...templateViews];
		
		// Add all user custom views (these are always preserved)
		userCustomViews.forEach(userView => {
			// Ensure no duplicate IDs (shouldn't happen with custom views, but safety first)
			if (!mergedViews.find(view => view.id === userView.id)) {
				mergedViews.push(userView);
			}
		});
		
		return mergedViews;
	}

	/**
	 * Get preview of configuration changes without applying them
	 */
	getConfigurationPreview(mode: OnboardingConfigMode): {
		viewsToAdd: ViewConfig[];
		viewsToUpdate: ViewConfig[];
		userCustomViewsPreserved: ViewConfig[];
		settingsChanges: string[];
	} {
		const configs = this.getOnboardingConfigs();
		const selectedConfig = configs.find(config => config.mode === mode);
		
		if (!selectedConfig) {
			throw new Error(`Configuration mode ${mode} not found`);
		}

		const currentViews = this.plugin.settings.viewConfiguration || [];
		const userCustomViews = currentViews.filter(view => view.type === 'custom');
		const templateViews = selectedConfig.settings.viewConfiguration || [];
		
		const currentViewIds = new Set(currentViews.map(view => view.id));
		const viewsToAdd = templateViews.filter(view => !currentViewIds.has(view.id));
		const viewsToUpdate = templateViews.filter(view => currentViewIds.has(view.id));
		
		// Analyze setting changes (simplified for now)
		const settingsChanges: string[] = [];
		if (selectedConfig.settings.enableView !== this.plugin.settings.enableView) {
			settingsChanges.push(`Views ${selectedConfig.settings.enableView ? 'enabled' : 'disabled'}`);
		}
		if (selectedConfig.settings.quickCapture?.enableQuickCapture !== this.plugin.settings.quickCapture?.enableQuickCapture) {
			settingsChanges.push(`Quick Capture ${selectedConfig.settings.quickCapture?.enableQuickCapture ? 'enabled' : 'disabled'}`);
		}
		if (selectedConfig.settings.workflow?.enableWorkflow !== this.plugin.settings.workflow?.enableWorkflow) {
			settingsChanges.push(`Workflow ${selectedConfig.settings.workflow?.enableWorkflow ? 'enabled' : 'disabled'}`);
		}

		return {
			viewsToAdd,
			viewsToUpdate,
			userCustomViewsPreserved: userCustomViews,
			settingsChanges
		};
	}

	/**
	 * Deep merge utility function
	 */
	private deepMerge(target: any, source: any): any {
		const result = { ...target };
		
		for (const key in source) {
			if (source.hasOwnProperty(key)) {
				if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
					result[key] = this.deepMerge(result[key] || {}, source[key]);
				} else {
					result[key] = source[key];
				}
			}
		}
		
		return result;
	}
}