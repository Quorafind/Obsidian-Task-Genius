/**
 * Integration tests for DateInheritanceService
 * Tests special cases for daily notes and file metadata handling
 */

import { DateInheritanceService, DateResolutionContext } from "../services/date-inheritance-service";
import { TimeComponent } from "../types/time-parsing";
import { Task } from "../types/task";

// Mock Obsidian modules
jest.mock("obsidian", () => ({
	App: jest.fn(),
	TFile: jest.fn(),
	Vault: jest.fn(),
	MetadataCache: jest.fn(),
}));

describe("DateInheritanceService Integration", () => {
	let service: DateInheritanceService;
	let mockApp: any;
	let mockVault: any;
	let mockMetadataCache: any;

	beforeEach(() => {
		mockApp = {};
		mockVault = {
			getAbstractFileByPath: jest.fn(),
			adapter: {
				stat: jest.fn(),
			},
		};
		mockMetadataCache = {
			getFileCache: jest.fn(),
		};

		service = new DateInheritanceService(mockApp, mockVault, mockMetadataCache);
	});

	afterEach(() => {
		jest.clearAllMocks();
		service.clearCache();
	});

	describe("daily note detection", () => {
		it("should detect various daily note formats", () => {
			const testCases = [
				// Standard formats
				{ path: "2024-03-15.md", expected: new Date(2024, 2, 15) },
				{ path: "Daily Notes/2024-03-15.md", expected: new Date(2024, 2, 15) },
				{ path: "Journal/2024.03.15.md", expected: new Date(2024, 2, 15) },
				{ path: "diary/2024_03_15.md", expected: new Date(2024, 2, 15) },
				{ path: "notes/20240315.md", expected: new Date(2024, 2, 15) },
				
				// US format
				{ path: "03-15-2024.md", expected: new Date(2024, 2, 15) },
				{ path: "03/15/2024.md", expected: new Date(2024, 2, 15) },
				
				// European format
				{ path: "15.03.2024.md", expected: new Date(2024, 2, 15) },
				
				// Monthly notes
				{ path: "2024-03.md", expected: new Date(2024, 2, 1) },
				
				// Weekly notes
				{ path: "2024-W11.md", expected: expect.any(Date) }, // Week 11 of 2024
				
				// Nested in date folders
				{ path: "2024/03/daily-note.md", expected: null }, // No date in filename
				{ path: "2024/03/2024-03-15.md", expected: new Date(2024, 2, 15) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				if (expected === null) {
					expect(result).toBeNull();
				} else if (expected instanceof Date) {
					expect(result).toEqual(expected);
				} else {
					expect(result).toEqual(expect.any(Date));
				}
			});
		});

		it("should handle edge cases and invalid dates", () => {
			const invalidCases = [
				"2024-13-15.md", // Invalid month
				"2024-02-30.md", // Invalid day for February
				"2024-00-15.md", // Invalid month (0)
				"regular-note.md", // No date pattern
				"2024.md", // Incomplete date
				"meeting-2024-03-15-notes.md", // Date in middle (should still work)
			];

			invalidCases.forEach((path) => {
				const result = service.extractDailyNoteDate(path);
				if (path === "meeting-2024-03-15-notes.md") {
					expect(result).toEqual(new Date(2024, 2, 15)); // Should extract date
				} else {
					expect(result).toBeNull();
				}
			});
		});

		it("should validate leap years correctly", () => {
			// 2024 is a leap year
			const leapYearDate = service.extractDailyNoteDate("2024-02-29.md");
			expect(leapYearDate).toEqual(new Date(2024, 1, 29));

			// 2023 is not a leap year
			const nonLeapYearDate = service.extractDailyNoteDate("2023-02-29.md");
			expect(nonLeapYearDate).toBeNull();

			// 2000 was a leap year (divisible by 400)
			const y2kLeapDate = service.extractDailyNoteDate("2000-02-29.md");
			expect(y2kLeapDate).toEqual(new Date(2000, 1, 29));

			// 1900 was not a leap year (divisible by 100 but not 400)
			const y1900Date = service.extractDailyNoteDate("1900-02-29.md");
			expect(y1900Date).toBeNull();
		});
	});

	describe("file metadata parsing", () => {
		it("should parse various metadata date formats", async () => {
			const testCases = [
				// Standard date formats
				{ frontmatter: { date: "2024-03-15" }, expected: new Date(2024, 2, 15) },
				{ frontmatter: { created: "2024-03-15T10:30:00" }, expected: new Date(2024, 2, 15, 10, 30, 0) },
				{ frontmatter: { "creation-date": "03/15/2024" }, expected: new Date(2024, 2, 15) },
				
				// Timestamp formats
				{ frontmatter: { day: 1710460800000 }, expected: new Date(1710460800000) },
				
				// Relative dates
				{ frontmatter: { date: "today" }, expected: expect.any(Date) },
				{ frontmatter: { date: "tomorrow" }, expected: expect.any(Date) },
				{ frontmatter: { date: "+1d" }, expected: expect.any(Date) },
				
				// Natural language
				{ frontmatter: { date: "monday" }, expected: expect.any(Date) },
				{ frontmatter: { date: "next friday" }, expected: expect.any(Date) },
				
				// Nested properties (Dataview)
				{ frontmatter: { file: { ctime: "2024-03-15" } }, expected: new Date(2024, 2, 15) },
				
				// Templater properties
				{ frontmatter: { tp: { date: "2024-03-15" } }, expected: new Date(2024, 2, 15) },
			];

			for (const { frontmatter, expected } of testCases) {
				const mockFile = { path: "test.md" };
				mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
				mockVault.adapter.stat.mockResolvedValue({
					ctime: new Date(2024, 0, 1).getTime(),
					mtime: new Date().getTime(),
				});
				mockMetadataCache.getFileCache.mockReturnValue({ frontmatter });

				const result = await service.getFileDateInfo("test.md");
				
				if (expected instanceof Date) {
					expect(result.metadataDate).toEqual(expected);
				} else {
					expect(result.metadataDate).toEqual(expect.any(Date));
				}
				
				// Clear cache for next test
				service.clearCache();
			}
		});

		it("should handle invalid metadata gracefully", async () => {
			const invalidFrontmatters = [
				{ date: "invalid-date-string" },
				{ date: null },
				{ date: {} },
				{ date: [] },
				{ date: "2024-13-45" }, // Invalid date
				{ date: "not a date at all" },
			];

			for (const frontmatter of invalidFrontmatters) {
				const mockFile = { path: "test.md" };
				mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
				mockVault.adapter.stat.mockResolvedValue({
					ctime: new Date(2024, 0, 1).getTime(),
					mtime: new Date().getTime(),
				});
				mockMetadataCache.getFileCache.mockReturnValue({ frontmatter });

				const result = await service.getFileDateInfo("test.md");
				expect(result.metadataDate).toBeNull();
				
				// Clear cache for next test
				service.clearCache();
			}
		});

		it("should prioritize date properties correctly", async () => {
			// Test that 'date' property takes precedence over 'created'
			const frontmatter = {
				created: "2024-03-10",
				date: "2024-03-15", // This should be used
				"creation-date": "2024-03-05",
			};

			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 0, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({ frontmatter });

			const result = await service.getFileDateInfo("test.md");
			expect(result.metadataDate).toEqual(new Date(2024, 2, 15));
		});
	});

	describe("integration scenarios", () => {
		it("should handle daily note with metadata override", async () => {
			// Daily note file with metadata that overrides the filename date
			const mockFile = { path: "Daily Notes/2024-03-15.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: { date: "2024-03-20" }, // Different from filename
			});

			const result = await service.getFileDateInfo("Daily Notes/2024-03-15.md");
			
			// Should have both daily note date and metadata date
			expect(result.dailyNoteDate).toEqual(new Date(2024, 2, 15));
			expect(result.metadataDate).toEqual(new Date(2024, 2, 20));
			expect(result.isDailyNote).toBe(true);
		});

		it("should resolve time-only expressions in daily notes", async () => {
			const mockTask: Task = {
				id: "test-task",
				content: "Meeting 12:00～13:00",
				filePath: "Daily Notes/2024-03-15.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Meeting 12:00～13:00",
				metadata: {
					tags: [],
					children: [],
				},
			} as Task;

			const timeComponent: TimeComponent = {
				hour: 12,
				minute: 0,
				originalText: "12:00",
				isRange: true,
				rangePartner: {
					hour: 13,
					minute: 0,
					originalText: "13:00",
					isRange: true,
				},
			};

			// Mock file operations for daily note
			const mockFile = { path: "Daily Notes/2024-03-15.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "- [ ] Meeting 12:00～13:00",
				filePath: "Daily Notes/2024-03-15.md",
			};

			const result = await service.resolveDateForTimeOnly(mockTask, timeComponent, context);

			expect(result.source).toBe("daily-note-date");
			expect(result.confidence).toBe("high");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
		});

		it("should handle complex folder structures", async () => {
			const testPaths = [
				"Personal/Journal/2024/March/2024-03-15.md",
				"Work/Daily Notes/2024-03-15.md",
				"Archive/2023/Daily/2023-12-31.md",
				"Templates/Daily Note Template.md", // Should not be detected as daily note
			];

			for (const filePath of testPaths) {
				const mockFile = { path: filePath };
				mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
				mockVault.adapter.stat.mockResolvedValue({
					ctime: new Date(2024, 0, 1).getTime(),
					mtime: new Date().getTime(),
				});
				mockMetadataCache.getFileCache.mockReturnValue({
					frontmatter: null,
				});

				const result = await service.getFileDateInfo(filePath);
				
				if (filePath.includes("Template")) {
					expect(result.dailyNoteDate).toBeNull();
					expect(result.isDailyNote).toBe(false);
				} else {
					expect(result.dailyNoteDate).not.toBeNull();
					expect(result.isDailyNote).toBe(true);
				}
				
				service.clearCache();
			}
		});

		it("should handle files without dates gracefully", async () => {
			const mockFile = { path: "Regular Note.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 10).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const result = await service.getFileDateInfo("Regular Note.md");
			
			expect(result.dailyNoteDate).toBeNull();
			expect(result.metadataDate).toBeNull();
			expect(result.isDailyNote).toBe(false);
			expect(result.ctime).toEqual(new Date(2024, 2, 10));
		});

		it("should handle missing files gracefully", async () => {
			mockVault.getAbstractFileByPath.mockReturnValue(null);

			const result = await service.getFileDateInfo("nonexistent.md");
			
			expect(result.dailyNoteDate).toBeNull();
			expect(result.metadataDate).toBeUndefined();
			expect(result.isDailyNote).toBe(false);
			expect(result.ctime).toEqual(expect.any(Date));
		});
	});

	describe("performance with various file types", () => {
		it("should efficiently process mixed file types", async () => {
			const filePaths = [
				"Daily Notes/2024-03-15.md",
				"Projects/Project A.md",
				"2024-03-16.md",
				"Meeting Notes/Weekly Sync.md",
				"Templates/Daily Template.md",
			];

			const startTime = Date.now();

			// Process all files
			for (const filePath of filePaths) {
				const mockFile = { path: filePath };
				mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
				mockVault.adapter.stat.mockResolvedValue({
					ctime: new Date(2024, 2, 1).getTime(),
					mtime: new Date().getTime(),
				});
				mockMetadataCache.getFileCache.mockReturnValue({
					frontmatter: filePath.includes("Project") ? { date: "2024-03-10" } : null,
				});

				await service.getFileDateInfo(filePath);
			}

			const endTime = Date.now();
			const processingTime = endTime - startTime;

			// Should complete quickly
			expect(processingTime).toBeLessThan(100); // 100ms for 5 files
			
			// Verify caching is working
			const cacheStats = service.getCacheStats();
			expect(cacheStats.size).toBe(filePaths.length);
		});
	});
});