import { REGEX_GOAL } from "./regex-goal";

function getParentTaskTextReadMode(taskElement: Element): string {
	// Clone the element to avoid modifying the original
	const clone = taskElement.cloneNode(true) as HTMLElement;

	// Remove all child lists (subtasks)
	const childLists = clone.querySelectorAll('ul');
	childLists.forEach(list => list.remove());

	// Remove the progress bar
	const progressBar = clone.querySelector('.cm-task-progress-bar');
	if (progressBar) progressBar.remove();

	// Get the text content and clean it up
	let text = clone.textContent || '';

	// Remove any extra whitespace
	text = text.trim();
	return text;
}

function extractTaskSpecificGoal(taskText: string): number | null {
    if (!taskText) return null;

    // Match only the patterns g::number or goal::number
    const goalMatch = taskText.match(REGEX_GOAL);
    if (!goalMatch) return null;

    return Number(goalMatch[2]);
}

export function extractTaskAndGoalInfoReadMode(taskElement: Element | null): number | null {
	if (!taskElement) return null;

	// Get the text content of the task
	const taskText = getParentTaskTextReadMode(taskElement);
	if (!taskText) return null;

	// Check for goal in g::number or goal::number format
	return extractTaskSpecificGoal(taskText);
}
export function getCustomTotalGoalReadMode(taskElement: HTMLElement | null | undefined): number | null {
	if (!taskElement) return null;

	// First check if the element already has a data-custom-goal attribute
	const customGoalAttr = taskElement.getAttribute('data-custom-goal');
	if (customGoalAttr) {
		const goalValue = parseInt(customGoalAttr, 10);
		if (!isNaN(goalValue)) {
			return goalValue;
		}
	}

	// If not found in attribute, extract from task text
	const taskText = getParentTaskTextReadMode(taskElement);
	if (!taskText) return null;

	// Extract goal using pattern g::number or goal::number
	const goalMatch = taskText.match(REGEX_GOAL);
	if (!goalMatch) return null;

	const goalValue = parseInt(goalMatch[2], 10);
	
	// Cache the result in the data attribute for future reference
	taskElement.setAttribute('data-custom-goal', goalValue.toString());
	
	return goalValue;
}

export function checkIfParentElementHasGoalFormat(taskElement: HTMLElement | null | undefined): boolean {
	if (!taskElement) return false;

	// Get the text content of the task
	const taskText = getParentTaskTextReadMode(taskElement);
	if (!taskText) return false;

	// Check for goal in g::number or goal::number format
	const goalMatch = taskText.match(REGEX_GOAL);
	return !!goalMatch;
}