// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import {
	findMetadataInsertPosition,
	findCompletedDateInsertPosition,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";

describe("autoDateManager - Final Verification", () => {
	it("should correctly place cancelled date for user's exact scenario", () => {
		// User's exact configuration
		const mockPlugin: Partial<TaskProgressBarPlugin> = {
			settings: {
				autoDateManager: {
					enabled: true,
					startDateMarker: "🛫", // User's marker
					completedDateMarker: "✅",
					cancelledDateMarker: "❌",
				},
				preferMetadataFormat: "emoji",
			},
		} as unknown as TaskProgressBarPlugin;

		// User's exact line
		const lineText = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		// Test cancelled date position
		const cancelledPos = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		// For comparison, test completed date position
		const completedPos = findCompletedDateInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin
		);
		
		// Verify positions are correct
		// Cancelled date should be placed after the start date
		const startDateEnd = lineText.indexOf("2025-04-20") + "2025-04-20".length;
		expect(cancelledPos).toBe(startDateEnd);
		
		// Completed date should be at the same position for consistency
		expect(completedPos).toBe(startDateEnd);
		
		// Simulate insertion
		const cancelledDate = " ❌ 2025-07-31";
		const newLineWithCancelled = 
			lineText.substring(0, cancelledPos) + 
			cancelledDate + 
			lineText.substring(cancelledPos);
			
		console.log("\nAfter cancelled date insertion:");
		console.log(newLineWithCancelled);
		
		// Verify structure is correct
		expect(newLineWithCancelled).toMatch(/🛫 2025-04-20 ❌ 2025-07-31 \^timer-161940-4775$/);
	});
	
	it("should handle case with no 🚀 emoji in text", () => {
		const mockPlugin: Partial<TaskProgressBarPlugin> = {
			settings: {
				autoDateManager: {
					enabled: true,
					startDateMarker: "🛫",
					completedDateMarker: "✅",
					cancelledDateMarker: "❌",
				},
				preferMetadataFormat: "emoji",
			},
		} as unknown as TaskProgressBarPlugin;

		// Line without 🚀 emoji
		const lineText = "- [-] 交流交底 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		console.log("\nSimpler case without 🚀:");
		console.log("Line:", lineText);
		console.log("Position:", position);
		console.log("Text after position:", lineText.substring(position));
		
		// Debug output
		const dateEndPos = lineText.indexOf("2025-04-20") + "2025-04-20".length;
		console.log("Date ends at:", dateEndPos);
		console.log("Character at dateEndPos:", lineText[dateEndPos]);
		console.log("Insert position:", position);
		console.log("Character at position:", lineText[position]);
		
		// Should be after 🛫 date (allowing for immediate insertion after date)
		expect(position).toBeGreaterThanOrEqual(lineText.indexOf("2025-04-20") + "2025-04-20".length);
		expect(position).toBeLessThan(lineText.indexOf("^timer"));
	});
});