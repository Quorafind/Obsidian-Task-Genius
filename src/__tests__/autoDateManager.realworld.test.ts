// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import {
	findMetadataInsertPosition,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";

describe("autoDateManager - Real World Test", () => {
	it("should handle user's exact case", () => {
		// Mock plugin with user's actual settings
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
					startDateMarker: "🛫", // User's actual marker
					completedDateMarker: "✅",
					cancelledDateMarker: "❌",
				},
				preferMetadataFormat: "emoji",
			},
		} as unknown as TaskProgressBarPlugin;

		// User's exact line
		const lineText = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		console.log("\n=== REAL WORLD TEST ===");
		console.log("User's line:", lineText);
		console.log("Line length:", lineText.length);
		console.log("Block ref starts at:", lineText.indexOf("^timer"));
		
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		// Use throw to output debug info
		throw new Error(`
DEBUG INFO:
- Line: ${lineText}
- Position: ${position}
- Text before: "${lineText.substring(0, position)}"
- Text after: "${lineText.substring(position)}"
- Character at position: "${lineText[position]}"
- Block ref index: ${lineText.indexOf("^timer")}
`);
		
		// The cancelled date should be inserted after 🛫 2025-04-20 but before ^timer
		const expectedPosition = lineText.indexOf(" ^timer");
		console.log("\nExpected position:", expectedPosition);
		console.log("Expected text after:", lineText.substring(expectedPosition));
		
		// Simulate insertion
		const cancelledDate = " ❌ 2025-07-31";
		const newLine = lineText.substring(0, position) + cancelledDate + lineText.substring(position);
		console.log("\nNew line after insertion:", newLine);
		
		// Verify the block reference is preserved
		expect(newLine).toContain("^timer-161940-4775");
		expect(newLine).not.toMatch(/\^timer.*❌/); // Cancelled date should not be after block ref
	});

	it("should test with debugging enabled", () => {
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

		// Simpler test case
		const lineText = "- [-] Task 🛫 2025-04-20 ^block-123";
		
		console.log("\n=== SIMPLE TEST ===");
		console.log("Line:", lineText);
		
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		console.log("Position:", position);
		console.log("Should insert at:", lineText.substring(0, position) + " <HERE>" + lineText.substring(position));
		
		// Should be after the date but before block ref
		expect(position).toBeLessThan(lineText.indexOf("^block"));
		expect(position).toBeGreaterThan(lineText.indexOf("2025-04-20") + "2025-04-20".length);
	});
});