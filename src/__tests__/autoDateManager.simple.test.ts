// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import {
	findMetadataInsertPosition,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";

describe("autoDateManager - Simple Cancelled Date Test", () => {
	it("should insert cancelled date after 🛫 date", () => {
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

		// Simple case: just 🛫 date and block ref
		const lineText = "- [-] Task 🛫 2025-04-20 ^block-id";
		
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		console.log("Position:", position);
		console.log("Text after position:", lineText.substring(position));
		
		// Should insert after 🛫 date
		expect(lineText.substring(position)).toBe(" ^block-id");
	});
	
	it("should handle complex line with dataview", () => {
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

		const lineText = "- [-] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		const position = findMetadataInsertPosition(
			lineText,
			mockPlugin as TaskProgressBarPlugin,
			"cancelled"
		);
		
		console.log("Complex line position:", position);
		console.log("Text before:", lineText.substring(0, position));
		console.log("Text after:", lineText.substring(position));
		
		// Should insert after 🛫 2025-04-20
		const expectedAfter = " ^timer-161940-4775";
		expect(lineText.substring(position)).toBe(expectedAfter);
	});
});