import TaskProgressBarPlugin from "../index";
import { RewardItem, RewardSettings } from "../common/setting-definition";
import { TFile, App, Notice, Component } from "obsidian";
import { RewardModal } from "../components/RewardModal"; // We'll create this modal later
import {
	parseAdvancedFilterQuery,
	evaluateFilterNode,
	FilterNode,
} from "./filterUtils";
import { Task } from "./types/TaskIndex";

export class RewardManager extends Component {
	private plugin: TaskProgressBarPlugin;
	private app: App;
	private settings: RewardSettings;

	constructor(plugin: TaskProgressBarPlugin) {
		super();
		this.plugin = plugin;
		this.app = plugin.app;
		this.settings = plugin.settings.rewards;

		this.registerEvent(
			this.app.workspace.on(
				"task-genius:task-completed",
				(task: Task) => {
					this.triggerReward(task);
				}
			)
		);
	}

	/**
	 * Call this method when a task is completed.
	 * @param task The completed task object.
	 */
	public async triggerReward(task: Task): Promise<void> {
		if (
			!this.settings.enableRewards ||
			!this.settings.rewardItems?.length
		) {
			return; // Rewards disabled or no rewards defined
		}

		const eligibleRewards = this.getEligibleRewards(task);
		console.log("eligibleRewards", eligibleRewards);
		if (!eligibleRewards.length) {
			return; // No rewards match the conditions or inventory is depleted
		}

		const chosenReward = this.drawReward(eligibleRewards);
		if (!chosenReward) {
			return; // Should not happen if eligibleRewards is not empty, but safety check
		}

		this.showRewardModal(chosenReward);
	}

	/**
	 * Filters the reward list based on inventory and conditions using filterUtils.
	 * @param task The completed task.
	 * @returns A list of rewards eligible for drawing.
	 */
	private getEligibleRewards(task: Task): RewardItem[] {
		// const now = Date.now(); // Keep if needed for time-based conditions later

		return this.settings.rewardItems.filter((reward) => {
			// 1. Check Inventory
			if (reward.inventory !== -1 && reward.inventory <= 0) {
				return false; // Skip if out of stock (and not infinite)
			}

			// 2. Check Condition using filterUtils
			if (reward.condition && reward.condition.trim()) {
				try {
					const conditionMet = this.evaluateCondition(
						reward.condition,
						task
					);
					if (!conditionMet) {
						return false; // Skip if condition not met
					}
				} catch (error) {
					console.error(
						`RewardManager: Error evaluating condition "${reward.condition}" for reward "${reward.name}":`,
						error
					);
					return false; // Skip if condition evaluation fails
				}
			}

			// If inventory and condition checks pass (or no condition), it's eligible
			return true;
		});
	}

	/**
	 * Evaluates if a task meets the reward's condition string using filterUtils.
	 * @param conditionString The condition string from the reward item.
	 * @param task The task object.
	 * @returns True if the condition is met, false otherwise.
	 * @throws Error if parsing or evaluation fails.
	 */
	private evaluateCondition(conditionString: string, task: Task): boolean {
		if (!conditionString || !conditionString.trim()) {
			return true; // Empty condition is always true
		}

		// Use the advanced parser
		const filterTree: FilterNode =
			parseAdvancedFilterQuery(conditionString);

		// Use the advanced evaluator
		// Need to ensure the Task interface here provides all fields
		// expected by evaluateFilterNode based on the conditionString
		// (e.g., if condition uses PRIORITY:, task needs priority property)
		return evaluateFilterNode(filterTree, task);
	}

	/**
	 * Draws a reward from the eligible list based on occurrence probabilities.
	 * @param eligibleRewards A list of rewards that have passed inventory and condition checks.
	 * @returns The chosen RewardItem or null if none could be drawn.
	 */
	private drawReward(eligibleRewards: RewardItem[]): RewardItem | null {
		const occurrenceMap = new Map<string, number>(
			this.settings.occurrenceLevels.map((level) => [
				level.name,
				level.chance,
			])
		);

		let totalWeight = 0;
		const weightedRewards: { reward: RewardItem; weight: number }[] = [];

		for (const reward of eligibleRewards) {
			const chance = occurrenceMap.get(reward.occurrence) ?? 0; // Default to 0 chance if occurrence level not found
			if (chance > 0) {
				weightedRewards.push({ reward, weight: chance });
				totalWeight += chance;
			}
		}

		if (totalWeight <= 0) {
			// This might happen if all eligible rewards have 0% chance based on defined levels
			console.warn(
				"RewardManager: No rewards could be drawn as total weight is zero. Check occurrence levels and chances."
			);
			// Optionally, fall back to a simple random pick from eligible ones? Or just return null.
			// For now, return null.
			return null;
			// // Fallback: Uniform random chance among eligibles if weights fail
			// if (eligibleRewards.length > 0) {
			//  const randomIndex = Math.floor(Math.random() * eligibleRewards.length);
			//  return eligibleRewards[randomIndex];
			// } else {
			//  return null;
			// }
		}

		let random = Math.random() * totalWeight;

		for (const { reward, weight } of weightedRewards) {
			if (random < weight) {
				return reward;
			}
			random -= weight;
		}

		// Fallback in case of floating point issues, return the last reward considered
		// Or handle this case more gracefully if needed.
		return weightedRewards.length > 0
			? weightedRewards[weightedRewards.length - 1].reward
			: null;
	}

	/**
	 * Shows a modal displaying the chosen reward.
	 * @param reward The reward item to display.
	 */
	private showRewardModal(reward: RewardItem): void {
		console.log("showRewardModal", this.settings.showRewardType);
		// Check if showRewardType is set to notice
		if (this.settings.showRewardType === "notice") {
			// Show a notice that automatically accepts the reward
			new Notice(`🎉 ${reward.name} (${reward.occurrence}) !`, 3500);
			// Automatically accept the reward (decrease inventory)
			this.acceptReward(reward);
			return;
		}

		// Original modal behavior
		new RewardModal(this.app, reward, (accepted) => {
			if (accepted) {
				this.acceptReward(reward);
				new Notice(`🎉 ${reward.name}!`); // Simple confirmation
			} else {
				// User skipped
				new Notice(`Skipped reward: ${reward.name}`);
			}
		}).open();
	}

	/**
	 * Called when the user accepts the reward. Updates inventory if necessary.
	 * @param acceptedReward The reward that was accepted.
	 */
	private async acceptReward(acceptedReward: RewardItem): Promise<void> {
		if (acceptedReward.inventory === -1) {
			return; // Infinite inventory, no need to update
		}

		// Find the reward in the settings and decrement its inventory
		const rewardIndex = this.settings.rewardItems.findIndex(
			(r) => r.id === acceptedReward.id
		);
		if (rewardIndex !== -1) {
			const currentInventory =
				this.plugin.settings.rewards.rewardItems[rewardIndex].inventory;
			// Ensure inventory is not already <= 0 before decrementing, though getEligibleRewards should prevent this.
			if (currentInventory > 0) {
				this.plugin.settings.rewards.rewardItems[rewardIndex]
					.inventory--;
				await this.plugin.saveSettings();
				console.log(
					`Reward accepted: ${acceptedReward.name}. Inventory updated to: ${this.plugin.settings.rewards.rewardItems[rewardIndex].inventory}`
				);
			} else if (currentInventory !== -1) {
				// Log if we somehow tried to accept a reward with 0 inventory (shouldn't happen)
				console.warn(
					`RewardManager: Attempted to accept reward ${acceptedReward.name} with inventory ${currentInventory}`
				);
			}
		} else {
			console.error(
				`RewardManager: Could not find accepted reward with id ${acceptedReward.id} in settings to update inventory.`
			);
		}
	}

	/**
	 * Updates the internal settings reference. Call this if settings are reloaded externally.
	 */
	public updateSettings(): void {
		this.settings = this.plugin.settings.rewards;
		console.log("RewardManager settings updated.");
	}
}
