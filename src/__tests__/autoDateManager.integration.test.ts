// @ts-ignore
import { describe, it, expect } from "@jest/globals";
import { EditorState, Transaction } from "@codemirror/state";
import {
	handleAutoDateManagerTransaction,
	findTaskStatusChange,
	determineDateOperations,
	applyDateOperations,
} from "../editor-ext/autoDateManager";
import TaskProgressBarPlugin from "../index";
import { App } from "obsidian";

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
			inProgress: "/|-",
			abandoned: "_",
			planned: "!",
			notStarted: " ",
		},
	},
} as unknown as TaskProgressBarPlugin;

const mockApp = {} as App;

describe("autoDateManager - Integration Test", () => {
	it("should handle cancelled date insertion with real transaction", () => {
		// User's exact line - task status changing from ' ' to '_' (abandoned)
		const originalLine = "- [ ] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		const modifiedLine = "- [_] 交流交底 🚀 2025-07-30 [stage::disclosure_communication] 🛫 2025-04-20 ^timer-161940-4775";
		
		// Create an editor state
		const startState = EditorState.create({
			doc: originalLine,
		});
		
		// Create a transaction that changes [ ] to [_]
		const tr = startState.update({
			changes: {
				from: 3,
				to: 4,
				insert: "_",
			},
		});
		
		console.log("Original:", originalLine);
		console.log("Modified:", modifiedLine);
		console.log("Transaction newDoc:", tr.newDoc.toString());
		
		// Find the task status change
		const statusChange = findTaskStatusChange(tr);
		if (!statusChange) {
			throw new Error("No status change found");
		}
		
		console.log("Status change:", statusChange);
		
		// Determine date operations
		const operations = determineDateOperations(
			statusChange.oldStatus,
			statusChange.newStatus,
			mockPlugin as TaskProgressBarPlugin,
			tr.newDoc.line(1).text
		);
		
		console.log("Operations:", operations);
		
		// Apply date operations
		const result = applyDateOperations(
			tr,
			tr.newDoc,
			1,
			operations,
			mockPlugin as TaskProgressBarPlugin
		);
		
		// This would throw if there's an issue
		throw new Error(`
INTEGRATION TEST DEBUG:
- Original: ${originalLine}
- Modified: ${modifiedLine}
- Operations: ${JSON.stringify(operations)}
- Result changes: ${JSON.stringify(result.changes)}
`);
	});
});