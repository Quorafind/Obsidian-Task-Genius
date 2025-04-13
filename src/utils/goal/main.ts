/**
 * Goal Tracking System
 * 
 * This module handles goal-related functionality for tasks in Obsidian Task Genius.
 * It supports extracting goal information from task text using g::number and goal::number formats.
 */

/**
 * Represents a collection of task-specific goal values
 */
export interface TaskGoalValues {
    /** Sum of goal values from completed tasks */
    completedGoalValue: number;
    /** Sum of all goal values from tasks */
    totalGoalValue: number;
}

/**
 * Class that manages all goal-related functionality
 */
export class TaskGoalManager {
    /**
     * Extract the text content of a task from a markdown line
     * 
     * @param lineText The full text of the markdown line containing the task
     * @return The extracted task text or null if no task was found
     */
    static extractTaskText(lineText: string): string | null {
        if (!lineText) return null;

        const taskTextMatch = lineText.match(/^[\s|\t]*([-*+]|\d+\.)\s\[(.)\]\s*(.*?)$/);
        if (taskTextMatch && taskTextMatch[3]) {
            return taskTextMatch[3].trim();
        }

        return null;
    }

    static isGoalActive(taskText: string): boolean {
        if (!taskText) return false;

        // Check for the presence of g:: or goal:: in the task text
        const goalMatch = taskText.match(/\b(g|goal)::(\d+)\b/i);
        return !!goalMatch;
    }

    /**
     * Check if a line of text contains a goal pattern
     * 
     * @param lineText A line of text to check for goal pattern
     * @return True if the line contains g:: or goal:: pattern, false otherwise
     */
    static lineHasGoalSyntax(lineText: string | null): boolean {
        if (!lineText) return false;
        
        // Check for g:: or goal:: pattern in the line
        return /\b(g|goal)::(\d+)\b/i.test(lineText);
    }

    /**
     * Extract the goal value from a task text
     * Supports only g::number or goal::number format
     * 
     * @param taskText The task text to extract the goal from
     * @return The extracted goal value or null if no goal found
     */
    static extractTaskSpecificGoal(taskText: string): number | null {
        if (!taskText) return null;

        // Match only the patterns g::number or goal::number
        const goalMatch = taskText.match(/\b(g|goal)::(\d+)\b/i);
        if (!goalMatch) return null;

        return Number(goalMatch[2]);
    }

    /**
     * Extract task text and goal information from a line
     * 
     * @param lineText The full text of the markdown line containing the task
     * @return The extracted goal value or null if no goal found
     */
    static extractTaskAndGoalInfo(lineText: string | null): number | null {
        if (!lineText) return null;

        // Extract task text
        const taskText = TaskGoalManager.extractTaskText(lineText);
        if (!taskText) return null;

        // Check for goal in g::number or goal::number format
        return TaskGoalManager.extractTaskSpecificGoal(taskText);
    }

    /**
     * Adjust task counts based on goal values
     * 
     * @param taskCounts Current task count values
     * @param customGoal Custom goal total value
     * @param completedGoalValue Sum of goal values from completed tasks
     * @param totalGoalValue Sum of all goal values
     * @return Updated task counts with goal-based adjustments
     */
    static adjustTaskCountsForGoals(
        taskCounts: {
            completed: number;
            total: number;
            inProgress?: number;
            abandoned?: number;
            notStarted?: number;
            planned?: number;
        },
        customGoal: number | null,
        completedGoalValue: number,
        totalGoalValue: number
    ) {
        const { completed, total, inProgress = 0, abandoned = 0, planned = 0 } = taskCounts;
        let adjustedCounts = { ...taskCounts };

        // If we have a custom goal specified with g::number format, use it as the total
        if (customGoal !== null) {
            // Always set the total to be the custom goal when specified
            adjustedCounts.total = customGoal;

            // If we also have task-specific goals, use the goal values to calculate completion
            if (totalGoalValue > 0) {
                // Calculate the percentage of completion based on goal values
                const completionRatio = completedGoalValue / customGoal;
                console.log("Completion ratio:", completionRatio);
                console.log("Custom goal:", customGoal);

                // Calculate completed count based on the goal completion ratio
                adjustedCounts.completed = Math.round(completionRatio * customGoal);
                adjustedCounts.completed = Math.min(adjustedCounts.completed, customGoal); // Ensure it doesn't exceed total

                // Adjust other counts proportionally
                adjustedCounts.notStarted = customGoal - adjustedCounts.completed - inProgress - abandoned - (planned || 0);
                adjustedCounts.notStarted = Math.max(0, adjustedCounts.notStarted); // Ensure it's not negative
            } else {
                // If no task-specific goals, use the completed tasks against the custom total goal
                adjustedCounts.completed = Math.min(completed, customGoal);

                // Adjust notStarted to make the math work out with the new total
                adjustedCounts.notStarted = customGoal - adjustedCounts.completed - inProgress - abandoned - (planned || 0);
                adjustedCounts.notStarted = Math.max(0, adjustedCounts.notStarted);
            }
        }
        console.log("Adjusted task counts for goals:", adjustedCounts);

        return adjustedCounts;
    }
}