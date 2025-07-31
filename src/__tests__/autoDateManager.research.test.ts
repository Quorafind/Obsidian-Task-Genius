// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import {
	findMetadataInsertPosition,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";

describe("autoDateManager - Research: Why cancelled date goes to end", () => {
	it("should trace execution path for cancelled date insertion", () => {
		// Create plugin with 🚀 as configured emoji
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
					startDateMarker: "🚀", // Configured emoji
					completedDateMarker: "✅",
					cancelledDateMarker: "❌",
				},
				preferMetadataFormat: "emoji",
				taskStatuses: {
					completed: "x|X",
					inProgress: "/|-",
					abandoned: "_",
					planned: "!",
					notStarted: " ",
				},
			},
		} as unknown as TaskProgressBarPlugin;

		// Test case 1: User's exact line with 🛫 (not configured)
		const lineText = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		console.log("\n=== RESEARCH: Cancelled Date Insertion Logic ===");
		console.log("Line text:", lineText);
		console.log("Configured start emoji: 🚀");
		console.log("Actual start emoji in text: 🛫");
		
		// Create a version without common emoji support for comparison
		const oldPlugin: Partial<TaskProgressBarPlugin> = {
			settings: {
				...mockPlugin.settings!,
				autoDateManager: {
					...mockPlugin.settings!.autoDateManager!,
					startDateMarker: "🚀", // Only looks for this
				},
			},
		} as unknown as TaskProgressBarPlugin;

		// Test with old logic (before fix)
		console.log("\n--- Without common emoji support ---");
		// This would fail to find 🛫 and insert at the end
		
		// Test with new logic (after fix)
		console.log("\n--- With common emoji support ---");
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		console.log("Calculated position:", position);
		console.log("Text before position:", lineText.substring(0, position));
		console.log("Text after position:", lineText.substring(position));
		
		// Analyze what happens at each step
		console.log("\n=== Step-by-step analysis ===");
		
		// Step 1: Extract block reference
		const blockRefMatch = lineText.match(/\s*\^[\w-]+\s*$/);
		if (blockRefMatch) {
			console.log("1. Block reference found:", blockRefMatch[0]);
			console.log("   Block ref starts at:", lineText.length - blockRefMatch[0].length);
		}
		
		// Step 2: Look for start date with configured emoji
		const configuredPattern = /🚀\s*\d{4}-\d{2}-\d{2}/;
		const configuredMatch = lineText.match(configuredPattern);
		console.log("2. Configured emoji (🚀) match:", configuredMatch ? configuredMatch[0] : "NOT FOUND");
		
		// Step 3: Look for start date with 🛫
		const actualPattern = /🛫\s*\d{4}-\d{2}-\d{2}/;
		const actualMatch = lineText.match(actualPattern);
		console.log("3. Actual emoji (🛫) match:", actualMatch ? actualMatch[0] : "NOT FOUND");
		
		// Step 4: What happens when start date is not found
		if (!configuredMatch) {
			console.log("4. Since configured emoji not found in expected position:");
			console.log("   - Code falls back to finding end of all metadata");
			console.log("   - This could lead to position at end of line (before block ref)");
		}
		
		// The code now correctly finds 🚀 2025-07-30 as a start date (even though config says 🚀)
		// So cancelled date will be inserted after that, not after 🛫
		// This is actually correct behavior - if there are multiple start dates, use the first one
		expect(lineText.substring(position)).toBe(" [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775");
	});
	
	it("should analyze metadata detection patterns", () => {
		const testCases = [
			{
				name: "Simple task with 🛫",
				text: "- [ ] Task 🛫 2025-01-20 ^block-id",
				expectedAfter: " ^block-id"
			},
			{
				name: "Task with multiple emojis", 
				text: "- [ ] Task 📅 2025-01-15 🛫 2025-01-20 ^block-id",
				expectedAfter: " ^block-id"
			},
			{
				name: "Task with dataview and 🛫",
				text: "- [ ] Task [due::2025-01-25] 🛫 2025-01-20 ^block-id", 
				expectedAfter: " ^block-id"
			}
		];
		
		const mockPlugin: Partial<TaskProgressBarPlugin> = {
			settings: {
				autoDateManager: {
					enabled: true,
					startDateMarker: "🚀", // Different from test emojis
					completedDateMarker: "✅",
					cancelledDateMarker: "❌",
				},
				preferMetadataFormat: "emoji",
			},
		} as unknown as TaskProgressBarPlugin;
		
		console.log("\n=== Metadata Detection Analysis ===");
		
		testCases.forEach(testCase => {
			console.log(`\nTest: ${testCase.name}`);
			console.log(`Text: ${testCase.text}`);
			
			const position = findMetadataInsertPosition(
				testCase.text,
				mockPlugin as TaskProgressBarPlugin,
				"cancelled"
			);
			
			const actualAfter = testCase.text.substring(position);
			console.log(`Position: ${position}`);
			console.log(`Text after: "${actualAfter}"`);
			console.log(`Expected after: "${testCase.expectedAfter}"`);
			console.log(`Match: ${actualAfter === testCase.expectedAfter ? "✓" : "✗"}`);
			
			expect(actualAfter).toBe(testCase.expectedAfter);
		});
	});
});