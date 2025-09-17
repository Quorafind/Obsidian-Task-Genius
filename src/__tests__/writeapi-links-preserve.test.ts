import { App, MetadataCache } from "obsidian";
import { WriteAPI } from "@/dataflow/api/WriteAPI";
import type { Task } from "@/types/task";

/**
 * Ensures updateTask preserves wiki/markdown links and inline code in task content
 * while replacing/rewriting trailing metadata.
 */
describe("WriteAPI.updateTask preserves links in content when regenerating metadata", () => {
	it("keeps [[wiki#section|alias]] and [text](url#anchor) and `code` intact and replaces metadata", async () => {
		// In-memory vault mock
		let fileContent =
			"- [ ] Do [[Page#Heading|alias]] and [text](https://ex.com/a#b) `inline` #oldtag 🔁 every day 🛫 2024-12-01";
		const filePath = "Test.md";

		const fakeVault: any = {
			getAbstractFileByPath: (path: string) => ({ path }),
			read: async (_file: any) => fileContent,
			modify: async (_file: any, newContent: string) => {
				fileContent = newContent;
			},
		};

		// Minimal app and metadataCache mocks
		const app = new App();
		const metadataCache = new MetadataCache();

		// Ensure workspace has trigger/on for Events.emit compatibility
		(app as any).workspace = {
			...(app as any).workspace,
			trigger: jest.fn(),
			on: jest.fn(() => ({ unload: () => {} })),
		};

		// Minimal plugin settings used by generateMetadata
		const plugin: any = {
			settings: {
				preferMetadataFormat: "tasks", // use emoji/tokens format
				projectTagPrefix: { tasks: "project", dataview: "project" },
				contextTagPrefix: { tasks: "@", dataview: "context" },
				taskStatuses: { completed: "x" },
				autoDateManager: {
					manageStartDate: false,
					manageCancelledDate: false,
				},
			},
		};

		// getTaskById returns a task pointing to line 0 in file
		const getTaskById = async (id: string): Promise<Task | null> => {
			if (id !== "1") return null;
			return {
				id: "1",
				content:
					"Do [[Page#Heading|alias]] and [text](https://ex.com/a#b) `inline`",
				filePath,
				line: 0,
				completed: false,
				status: " ",
				originalMarkdown: fileContent,
				metadata: {
					tags: ["oldtag"],
					children: [],
				} as any,
			} as Task;
		};

		const writeAPI = new WriteAPI(
			app as any,
			fakeVault,
			metadataCache as any,
			plugin,
			getTaskById
		);

		// Act: update metadata only (do not touch content/status)
		const due = new Date("2025-01-15").valueOf();
		const res = await writeAPI.updateTask({
			taskId: "1",
			updates: {
				metadata: { tags: ["newtag"], dueDate: due } as any,
			},
		});

		expect(res.success).toBe(true);

		// Assert: links and inline code remain; old metadata removed; new metadata appended
		// Expect tags first then due date (emoji 📅) in tasks format
		expect(fileContent).toContain(
			"- [ ] Do [[Page#Heading|alias]] and [text](https://ex.com/a#b) `inline` #newtag 📅 2025-01-15"
		);

		// Ensure no remnants of old metadata tokens
		expect(fileContent).not.toMatch(
			/#oldtag|🔁\s+every day|🛫\s+2024-12-01/
		);
	});
});
