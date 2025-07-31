// @ts-ignore
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import {
	handleAutoDateManagerTransaction,
	findTaskStatusChange,
	determineDateOperations,
	getStatusType,
	applyDateOperations,
	isMoveOperation,
	findMetadataInsertPosition,
} from "../editor-ext/autoDateManager";
import { Transaction, Text, EditorState } from "@codemirror/state";
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
			startDateMarker: "🚀",
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

// Mock the App
const mockApp = {} as App;

describe("autoDateManager - Block Reference Support", () => {
	describe("Block Reference Detection", () => {
		it("should detect simple block reference at end of line", () => {
			const lineText = "- [ ] Task with block reference ^task-123";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before the block reference
			expect(lineText.substring(position)).toBe(" ^task-123");
		});

		it("should detect block reference with trailing spaces", () => {
			const lineText = "- [ ] Task with block reference ^task-123  ";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before the block reference
			expect(lineText.substring(position)).toBe(" ^task-123  ");
		});

		it("should detect block reference with underscores and hyphens", () => {
			const lineText = "- [ ] Task with block reference ^task_123-abc";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before the block reference
			expect(lineText.substring(position)).toBe(" ^task_123-abc");
		});

		it("should not confuse caret in middle of text with block reference", () => {
			const lineText = "- [ ] Task with ^caret in middle and more text";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert at the end since ^caret is not at the end
			expect(position).toBe(lineText.length);
		});
	});

	describe("Date Insertion with Block References", () => {
		it("should insert completed date before block reference", () => {
			const lineText = "- [ ] Task to complete ^task-123";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Position should be before the block reference
			expect(lineText.substring(0, position)).toBe("- [ ] Task to complete");
			expect(lineText.substring(position)).toBe(" ^task-123");
		});

		it("should insert start date before block reference", () => {
			const lineText = "- [ ] Task to start ^task-456";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"start"
			);
			// Position should be before the block reference
			expect(lineText.substring(0, position)).toBe("- [ ] Task to start");
			expect(lineText.substring(position)).toBe(" ^task-456");
		});

		it("should insert cancelled date after start date but before block reference", () => {
			const lineText = "- [ ] Task with start date 🚀 2024-01-15 ^task-789";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"cancelled"
			);
			// Position should be after start date but before block reference
			expect(lineText.substring(0, position)).toBe("- [ ] Task with start date 🚀 2024-01-15");
			expect(lineText.substring(position)).toBe(" ^task-789");
		});

		it("should handle multiple metadata before block reference", () => {
			const lineText = "- [ ] Task with tags #important #urgent ^task-999";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Position should be after tags but before block reference
			expect(lineText.substring(position)).toBe(" ^task-999");
		});
	});

	describe("Date Removal with Block References", () => {
		it("should preserve block reference when removing completed date", () => {
			// This test would require mocking the full transaction system
			// For now, we test that the position calculation is correct
			const lineText = "- [x] Completed task ✅ 2024-01-20 ^task-123";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// The position should still respect the block reference
			expect(lineText.substring(position)).toBe(" ^task-123");
		});
	});

	describe("Complex Block Reference Scenarios", () => {
		it("should handle task with dataview fields and block reference", () => {
			const lineText = "- [ ] Task [due::2024-01-25] [priority::high] ^complex-123";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert after dataview fields but before block reference
			expect(lineText.substring(position)).toBe(" ^complex-123");
		});

		it("should handle task with emojis and block reference", () => {
			const lineText = "- [ ] Task with emoji 📅 2024-01-25 ^emoji-task";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert after date emoji but before block reference
			expect(lineText.substring(position)).toBe(" ^emoji-task");
		});

		it("should handle task with wikilinks and block reference", () => {
			const lineText = "- [ ] Task mentioning [[Some Page]] ^wiki-task";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert after wikilink but before block reference
			expect(lineText.substring(position)).toBe(" ^wiki-task");
		});
	});

	describe("Edge Cases", () => {
		it("should handle empty task with only block reference", () => {
			const lineText = "- [ ] ^empty-task";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before block reference
			expect(lineText.substring(position)).toBe(" ^empty-task");
		});

		it("should handle block reference without space", () => {
			const lineText = "- [ ] Task^no-space";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before block reference
			expect(lineText.substring(position)).toBe("^no-space");
		});

		it("should handle very long block reference IDs", () => {
			const lineText = "- [ ] Task ^very-long-block-reference-id-that-might-be-generated-automatically";
			const position = findMetadataInsertPosition(
				lineText,
				mockPlugin as TaskProgressBarPlugin,
				"completed"
			);
			// Should insert before block reference
			expect(lineText.substring(position)).toBe(" ^very-long-block-reference-id-that-might-be-generated-automatically");
		});
	});
});

describe("autoDateManager - Dataview Format with Block References", () => {
	const mockPluginDataview: Partial<TaskProgressBarPlugin> = {
		...mockPlugin,
		settings: {
			...mockPlugin.settings!,
			preferMetadataFormat: "dataview",
		},
	} as unknown as TaskProgressBarPlugin;

	it("should insert dataview date before block reference", () => {
		const lineText = "- [ ] Task with dataview format ^dataview-123";
		const position = findMetadataInsertPosition(
			lineText,
			mockPluginDataview as TaskProgressBarPlugin,
			"completed"
		);
		// Should insert before block reference
		expect(lineText.substring(position)).toBe(" ^dataview-123");
	});

	it("should handle existing dataview fields with block reference", () => {
		const lineText = "- [ ] Task [start::2024-01-15] ^dataview-456";
		const position = findMetadataInsertPosition(
			lineText,
			mockPluginDataview as TaskProgressBarPlugin,
			"cancelled"
		);
		// Should insert after start date but before block reference
		expect(lineText.substring(0, position)).toBe("- [ ] Task [start::2024-01-15]");
		expect(lineText.substring(position)).toBe(" ^dataview-456");
	});
});