import { QuickCaptureModal } from "../components/QuickCaptureModal";
import { DEFAULT_TIME_PARSING_CONFIG } from "../utils/TimeParsingService";
import { App } from "obsidian";

// Mock dependencies
jest.mock("obsidian", () => ({
	App: jest.fn(),
	Modal: class MockModal {
		constructor(app: any, plugin: any) {}
		onOpen() {}
		onClose() {}
		close() {}
		modalEl = { toggleClass: jest.fn() };
		titleEl = { createDiv: jest.fn(), createEl: jest.fn() };
		contentEl = {
			empty: jest.fn(),
			createDiv: jest.fn(() => ({
				createDiv: jest.fn(),
				createEl: jest.fn(),
				createSpan: jest.fn(),
				addClass: jest.fn(),
				setAttribute: jest.fn(),
				addEventListener: jest.fn(),
			})),
			createEl: jest.fn(),
		};
	},
	Setting: class MockSetting {
		constructor(containerEl: any) {}
		setName(name: string) {
			return this;
		}
		setDesc(desc: string) {
			return this;
		}
		addToggle(cb: any) {
			return this;
		}
		addText(cb: any) {
			return this;
		}
		addTextArea(cb: any) {
			return this;
		}
		addDropdown(cb: any) {
			return this;
		}
	},
	Notice: jest.fn(),
	Platform: { isPhone: false },
	MarkdownRenderer: jest.fn(),
	moment: () => ({ format: jest.fn(() => "2025-01-04") }),
}));

jest.mock("../editor-ext/markdownEditor", () => ({
	createEmbeddableMarkdownEditor: jest.fn(() => ({
		value: "",
		editor: { focus: jest.fn() },
		scope: { register: jest.fn() },
		destroy: jest.fn(),
	})),
}));

jest.mock("../utils/fileUtils", () => ({
	saveCapture: jest.fn(),
	processDateTemplates: jest.fn(),
}));

jest.mock("../components/AutoComplete", () => ({
	FileSuggest: jest.fn(),
	ContextSuggest: jest.fn(),
	ProjectSuggest: jest.fn(),
}));

jest.mock("../translations/helper", () => ({
	t: (key: string) => key,
}));

jest.mock("../components/MarkdownRenderer", () => ({
	MarkdownRendererComponent: class MockMarkdownRenderer {
		constructor() {}
		render() {}
		unload() {}
	},
}));

jest.mock("../components/StatusComponent", () => ({
	StatusComponent: class MockStatusComponent {
		constructor() {}
		load() {}
	},
}));

describe("QuickCaptureModal Time Parsing Integration", () => {
	let mockApp: any;
	let mockPlugin: any;
	let modal: QuickCaptureModal;

	beforeEach(() => {
		mockApp = new App();
		mockPlugin = {
			settings: {
				quickCapture: {
					targetType: "fixed",
					targetFile: "test.md",
					placeholder: "Enter task...",
					dailyNoteSettings: {
						format: "YYYY-MM-DD",
						folder: "",
						template: "",
					},
				},
				preferMetadataFormat: "tasks",
				timeParsing: DEFAULT_TIME_PARSING_CONFIG,
			},
		};

		modal = new QuickCaptureModal(mockApp, mockPlugin, undefined, true);
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe("Time Parsing Service Integration", () => {
		test("should initialize with plugin settings", () => {
			expect(modal.timeParsingService).toBeDefined();
			expect(modal.timeParsingService.getConfig()).toEqual(
				mockPlugin.settings.timeParsing
			);
		});

		test("should fallback to default config when plugin settings missing", () => {
			const pluginWithoutTimeParsing = {
				...mockPlugin,
				settings: {
					...mockPlugin.settings,
					timeParsing: undefined,
				},
			};

			const modalWithoutConfig = new QuickCaptureModal(
				mockApp,
				pluginWithoutTimeParsing,
				undefined,
				true
			);
			expect(modalWithoutConfig.timeParsingService).toBeDefined();
			expect(modalWithoutConfig.timeParsingService.getConfig()).toEqual(
				DEFAULT_TIME_PARSING_CONFIG
			);
		});
	});

	describe("Content Processing with Time Parsing", () => {
		test("should parse time expressions and update metadata", () => {
			const content = "go to bed tomorrow";
			const result = modal.processContentWithMetadata(content);

			// Should contain task metadata
			expect(result).toContain("📅");
			// Should not contain 'tomorrow' in the final result (cleaned)
			expect(result).not.toContain("tomorrow");
		});

		test("should handle multiple time expressions", () => {
			const content = "start project tomorrow and finish by next week";
			const result = modal.processContentWithMetadata(content);

			// Should process the content and add metadata
			expect(result).toContain("- [ ]");
		});

		test("should preserve content when no time expressions found", () => {
			const content = "regular task without dates";
			const result = modal.processContentWithMetadata(content);

			expect(result).toContain("regular task without dates");
		});

		test("should handle Chinese time expressions", () => {
			const content = "明天开会";
			const result = modal.processContentWithMetadata(content);

			// Should contain task metadata
			expect(result).toContain("📅");
			// Should not contain '明天' in the final result (cleaned)
			expect(result).not.toContain("明天");
		});
	});

	describe("Multiline Processing Integration", () => {
		test("should preserve line structure in multiline content", () => {
			const content = "Task 1 tomorrow\nTask 2 next week\nTask 3 no date";
			const result = modal.processContentWithMetadata(content);

			// Should split into separate lines
			const lines = result.split("\n");
			expect(lines).toHaveLength(3);

			// Each line should be a task
			lines.forEach((line) => {
				expect(line).toMatch(/^- \[ \]/);
			});
		});

		test("should handle different dates per line", () => {
			const content = "Task 1 tomorrow\nTask 2 next week\nTask 3";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(3);

			// First line should have a date
			expect(lines[0]).toContain("📅");
			expect(lines[0]).not.toContain("tomorrow");

			// Second line should have a different date
			expect(lines[1]).toContain("📅");
			expect(lines[1]).not.toContain("next week");

			// Third line should have no date
			expect(lines[2]).not.toContain("📅");
			expect(lines[2]).toContain("Task 3");
		});

		test("should handle mixed Chinese and English time expressions", () => {
			const content = "任务1 明天\nTask 2 tomorrow\n任务3";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(3);

			// First line (Chinese)
			expect(lines[0]).toContain("📅");
			expect(lines[0]).not.toContain("明天");
			expect(lines[0]).toContain("任务1");

			// Second line (English)
			expect(lines[1]).toContain("📅");
			expect(lines[1]).not.toContain("tomorrow");
			expect(lines[1]).toContain("Task 2");

			// Third line (no date)
			expect(lines[2]).not.toContain("📅");
			expect(lines[2]).toContain("任务3");
		});

		test("should handle existing task format with different dates", () => {
			const content =
				"- [ ] Task 1 tomorrow\n- [x] Task 2 next week\n- Task 3";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(3);

			// First line should preserve checkbox and add date
			expect(lines[0]).toMatch(/^- \[ \]/);
			expect(lines[0]).toContain("📅");
			expect(lines[0]).not.toContain("tomorrow");

			// Second line should preserve completed status and add date
			expect(lines[1]).toMatch(/^- \[x\]/);
			expect(lines[1]).toContain("📅");
			expect(lines[1]).not.toContain("next week");

			// Third line should be converted to task format
			expect(lines[2]).toMatch(/^- \[ \]/);
			expect(lines[2]).not.toContain("📅");
		});

		test("should handle indented subtasks correctly", () => {
			const content =
				"Main task tomorrow\n  Subtask 1 next week\n  Subtask 2";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(3);

			// Main task should have date
			expect(lines[0]).toContain("📅");
			expect(lines[0]).not.toContain("tomorrow");

			// Subtasks should preserve indentation but still clean time expressions
			expect(lines[1]).toMatch(/^\s+/); // Should start with whitespace
			expect(lines[1]).not.toContain("next week");

			expect(lines[2]).toMatch(/^\s+/); // Should start with whitespace
			expect(lines[2]).toContain("Subtask 2");
		});

		test("should handle empty lines in multiline content", () => {
			const content = "Task 1 tomorrow\n\nTask 2 next week\n\n";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(5);

			// First line should be a task with date
			expect(lines[0]).toMatch(/^- \[ \]/);
			expect(lines[0]).toContain("📅");

			// Second line should be empty
			expect(lines[1]).toBe("");

			// Third line should be a task with date
			expect(lines[2]).toMatch(/^- \[ \]/);
			expect(lines[2]).toContain("📅");

			// Fourth and fifth lines should be empty
			expect(lines[3]).toBe("");
			expect(lines[4]).toBe("");
		});

		test("should handle global metadata combined with line-specific dates", () => {
			// Set global metadata
			modal.taskMetadata.priority = 3;
			modal.taskMetadata.project = "TestProject";

			const content = "Task 1 tomorrow\nTask 2 next week";
			const result = modal.processContentWithMetadata(content);

			const lines = result.split("\n");
			expect(lines).toHaveLength(2);

			// Both lines should have global metadata (priority, project) plus line-specific dates
			lines.forEach((line) => {
				expect(line).toContain("🔼"); // Priority medium
				expect(line).toContain("#project/TestProject");
				expect(line).toContain("📅"); // Line-specific date
			});

			// Clean up
			modal.taskMetadata.priority = undefined;
			modal.taskMetadata.project = undefined;
		});
	});

	describe("Manual Override Functionality", () => {
		test("should track manually set dates", () => {
			modal.markAsManuallySet("dueDate");
			expect(modal.isManuallySet("dueDate")).toBe(true);
			expect(modal.isManuallySet("startDate")).toBe(false);
		});

		test("should not override manually set dates", () => {
			// Manually set a due date
			modal.taskMetadata.dueDate = new Date("2025-01-10");
			modal.markAsManuallySet("dueDate");

			// Process content with time expression
			const content = "task tomorrow";
			modal.processContentWithMetadata(content);

			// Should preserve manually set date
			expect(modal.taskMetadata.dueDate).toEqual(new Date("2025-01-10"));
		});
	});

	describe("Metadata Format Generation", () => {
		test("should generate metadata in tasks format", () => {
			modal.preferMetadataFormat = "tasks";
			modal.taskMetadata.dueDate = new Date("2025-01-05");
			modal.taskMetadata.priority = 3;

			const metadata = modal.generateMetadataString();
			expect(metadata).toContain("📅 2025-01-05");
			expect(metadata).toContain("🔼");
		});

		test("should generate metadata in dataview format", () => {
			modal.preferMetadataFormat = "dataview";
			modal.taskMetadata.dueDate = new Date("2025-01-05");
			modal.taskMetadata.priority = 3;

			const metadata = modal.generateMetadataString();
			expect(metadata).toContain("[due:: 2025-01-05]");
			expect(metadata).toContain("[priority:: medium]");
		});
	});

	describe("Task Line Processing", () => {
		test("should convert plain text to task with metadata", () => {
			modal.taskMetadata.dueDate = new Date("2025-01-05");
			const taskLine = modal.addMetadataToTask("- [ ] test task");

			expect(taskLine).toContain("- [ ] test task");
			expect(taskLine).toContain("📅 2025-01-05");
		});

		test("should handle existing task format", () => {
			modal.taskMetadata.dueDate = new Date("2025-01-05");
			const taskLine = modal.addMetadataToTask("- [x] completed task");

			expect(taskLine).toContain("- [x] completed task");
			expect(taskLine).toContain("📅 2025-01-05");
		});
	});

	describe("Date Formatting", () => {
		test("should format dates correctly", () => {
			const date = new Date("2025-01-05");
			const formatted = modal.formatDate(date);
			expect(formatted).toBe("2025-01-05");
		});

		test("should parse date strings correctly", () => {
			const parsed = modal.parseDate("2025-01-05");
			expect(parsed.getFullYear()).toBe(2025);
			expect(parsed.getMonth()).toBe(0); // January is 0
			expect(parsed.getDate()).toBe(5);
		});
	});

	describe("Error Handling", () => {
		test("should handle invalid time expressions gracefully", () => {
			const content = "task with invalid date xyz123";
			const result = modal.processContentWithMetadata(content);

			// Should not crash and should return valid content
			expect(result).toContain("task with invalid date xyz123");
		});

		test("should handle empty content", () => {
			const content = "";
			const result = modal.processContentWithMetadata(content);

			expect(result).toBe("");
		});
	});

	describe("Configuration Updates", () => {
		test("should update time parsing service when config changes", () => {
			const newConfig = { enabled: false };
			modal.timeParsingService.updateConfig(newConfig);

			const config = modal.timeParsingService.getConfig();
			expect(config.enabled).toBe(false);
		});
	});
});
