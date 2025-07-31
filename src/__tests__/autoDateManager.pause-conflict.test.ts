// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import {
	findTaskStatusChange,
	determineDateOperations,
	getStatusType,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";

// Mock the plugin
const mockPlugin: Partial<TaskProgressBarPlugin> = {
	settings: {
		autoDateManager: {
			enabled: true,
			manageStartDate: true,
			manageCompletedDate: true,
			manageCancelledDate: true,
			startDateFormat: "YYYY-MM-DD",
			completedDateFormat: "YYYY-MM-DD", 
			cancelledDateFormat: "YYYY-MM-DD",
			startDateMarker: "🛫",
			completedDateMarker: "✅",
			cancelledDateMarker: "❌",
		},
		preferMetadataFormat: "emoji",
		taskStatuses: {
			completed: "x|X",
			inProgress: "/|-|>",
			abandoned: "_|-",  // Note: '-' is used for both paused and abandoned
			planned: "!",
			notStarted: " ",
		},
	},
} as unknown as TaskProgressBarPlugin;

describe("autoDateManager - Pause Timer Conflict", () => {
	it("should identify conflict when pausing timer changes status to abandoned", () => {
		// When timer is paused, status changes from '/' to '-'
		const oldStatus = "/";
		const newStatus = "-";
		const lineText = "- [-] Task with timer 🛫 2025-04-20 ^timer-123";
		
		// Check what autoDateManager will do
		const oldType = getStatusType(oldStatus, mockPlugin as TaskProgressBarPlugin);
		const newType = getStatusType(newStatus, mockPlugin as TaskProgressBarPlugin);
		
		console.log(`Status change: "${oldStatus}" (${oldType}) -> "${newStatus}" (${newType})`);
		
		// Both '/' and '-' are configured, so types should be identified
		expect(oldType).toBe("inProgress");
		expect(newType).toBe("abandoned");
		
		// Determine what date operations would be triggered
		const operations = determineDateOperations(
			oldStatus,
			newStatus,
			mockPlugin as TaskProgressBarPlugin,
			lineText
		);
		
		console.log("Date operations:", operations);
		
		// PROBLEM: When pausing, autoDateManager will try to add a cancelled date
		expect(operations).toHaveLength(1);
		expect(operations[0]).toMatchObject({
			type: "add",
			dateType: "cancelled",
		});
		
		// This is the conflict: pause operation triggers date insertion
	});

	it("should show that '-' marker is ambiguous (used for both pause and abandoned)", () => {
		// The '-' marker is used for both:
		// 1. Paused tasks (temporary state while timer is paused)
		// 2. Abandoned/cancelled tasks (permanent state)
		
		const pausedTaskStatus = "-";
		const abandonedTaskStatus = "-";
		
		const pausedType = getStatusType(pausedTaskStatus, mockPlugin as TaskProgressBarPlugin);
		const abandonedType = getStatusType(abandonedTaskStatus, mockPlugin as TaskProgressBarPlugin);
		
		// Both resolve to the same type
		expect(pausedType).toBe("abandoned");
		expect(abandonedType).toBe("abandoned");
		
		// This ambiguity causes autoDateManager to treat paused tasks as abandoned
		// and insert a cancelled date, which may not be desired for temporary pauses
	});

	it("should demonstrate the specific user scenario", () => {
		// User's exact scenario
		const taskBeforePause = "- [/] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		const taskAfterPause = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		// Status change from '/' to '-'
		const operations = determineDateOperations(
			"/",
			"-",
			mockPlugin as TaskProgressBarPlugin,
			taskAfterPause
		);
		
		// AutoDateManager will add a cancelled date
		expect(operations).toContainEqual({
			type: "add",
			dateType: "cancelled",
			format: "YYYY-MM-DD",
		});
		
		// Expected result after autoDateManager processes it:
		// The cancelled date (❌ 2025-07-31) would be inserted
		const expectedResult = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ❌ 2025-07-31 ^timer-161940-4775";
		
		console.log("Task before pause:", taskBeforePause);
		console.log("Task after pause:", taskAfterPause);
		console.log("Expected with date:", expectedResult);
	});

	it("should suggest solutions for the conflict", () => {
		// Potential solutions:
		
		// Solution 1: Check for timer-specific annotations
		const isTimerOperation = (annotation: string) => {
			return annotation === "taskTimer" || annotation.includes("timer");
		};
		
		// Solution 2: Use different status markers for pause vs abandoned
		const alternativeStatuses = {
			paused: "p",      // New marker specifically for paused
			abandoned: "_",   // Keep _ for truly abandoned tasks
			inProgress: "/",
		};
		
		// Solution 3: Add configuration to skip date management for timer operations
		const skipDateManagementForTimers = true;
		
		// Solution 4: Check for timer-related block references
		const hasTimerBlockRef = (text: string) => {
			return /\^timer-\d+/.test(text);
		};
		
		expect(isTimerOperation("taskTimer")).toBe(true);
		expect(hasTimerBlockRef("^timer-123")).toBe(true);
	});
});