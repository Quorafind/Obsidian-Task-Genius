import { addDays } from "date-fns";
import { StandardTaskMetadata, Task } from "@/types/task";

export type TaskDateType = "dueDate" | "startDate" | "scheduledDate";

/**
 * Calculate a new timestamp by shifting days relative to the current value.
 */
export function postponeDate(currentTimestamp: number, offsetDays: number): number {
	if (!offsetDays) {
		return currentTimestamp;
	}

	if (typeof currentTimestamp !== "number" || Number.isNaN(currentTimestamp)) {
		return currentTimestamp;
	}

	return addDays(new Date(currentTimestamp), offsetDays).getTime();
}

/**
 * Update task metadata while keeping related date fields consistent.
 */
export function smartPostponeRelatedDates(
	task: Task,
	dateType: TaskDateType,
	newTimestamp: number,
	offsetDays: number,
): StandardTaskMetadata {
	const metadata: StandardTaskMetadata = {
		...(task.metadata as StandardTaskMetadata),
		[dateType]: newTimestamp,
	};

	if (!offsetDays) {
		return metadata;
	}

	if (
		dateType === "dueDate" &&
		typeof task.metadata?.startDate === "number" &&
		task.metadata.startDate > newTimestamp
	) {
		metadata.startDate = postponeDate(task.metadata.startDate, offsetDays);
	}

	if (
		dateType === "dueDate" &&
		typeof task.metadata?.scheduledDate === "number" &&
		task.metadata.scheduledDate > newTimestamp
	) {
		metadata.scheduledDate = postponeDate(task.metadata.scheduledDate, offsetDays);
	}

	return metadata;
}

/**
 * Return the list of date fields that are currently set on the task.
 */
export function getExistingDateTypes(task: Task): TaskDateType[] {
	const metadata = task.metadata ?? {};
	const dateTypes: TaskDateType[] = ["dueDate", "startDate", "scheduledDate"];

	return dateTypes.filter((type) => typeof (metadata as StandardTaskMetadata)[type] === "number");
}
