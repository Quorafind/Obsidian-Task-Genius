/**
 * Unit tests for DateInheritanceService
 * Tests date inheritance priority logic for time-only expressions
 */

import { DateInheritanceService, DateResolutionContext, FileDateInfo } from "../services/date-inheritance-service";
import { TimeComponent } from "../types/time-parsing";
import { Task } from "../types/task";

// Mock Obsidian modules
jest.mock("obsidian", () => ({
	App: jest.fn(),
	TFile: jest.fn(),
	Vault: jest.fn(),
	MetadataCache: jest.fn(),
}));

describe("DateInheritanceService", () => {
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

	describe("extractDailyNoteDate", () => {
		it("should extract date from YYYY-MM-DD format", () => {
			const testCases = [
				{ path: "2024-03-15.md", expected: new Date(2024, 2, 15) },
				{ path: "Daily Notes/2024-03-15.md", expected: new Date(2024, 2, 15) },
				{ path: "notes/2024-12-31-meeting.md", expected: new Date(2024, 11, 31) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toEqual(expected);
			});
		});

		it("should extract date from YYYY.MM.DD format", () => {
			const testCases = [
				{ path: "2024.03.15.md", expected: new Date(2024, 2, 15) },
				{ path: "notes/2024.12.31.md", expected: new Date(2024, 11, 31) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toEqual(expected);
			});
		});

		it("should extract date from YYYY_MM_DD format", () => {
			const testCases = [
				{ path: "2024_03_15.md", expected: new Date(2024, 2, 15) },
				{ path: "daily/2024_12_31.md", expected: new Date(2024, 11, 31) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toEqual(expected);
			});
		});

		it("should extract date from YYYYMMDD format", () => {
			const testCases = [
				{ path: "20240315.md", expected: new Date(2024, 2, 15) },
				{ path: "notes/20241231.md", expected: new Date(2024, 11, 31) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toEqual(expected);
			});
		});

		it("should handle MM-DD-YYYY format (US format)", () => {
			const testCases = [
				{ path: "03-15-2024.md", expected: new Date(2024, 2, 15) },
				{ path: "12-31-2024.md", expected: new Date(2024, 11, 31) },
			];

			testCases.forEach(({ path, expected }) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toEqual(expected);
			});
		});

		it("should return null for invalid dates", () => {
			const invalidPaths = [
				"2024-13-15.md", // Invalid month
				"2024-02-30.md", // Invalid day for February
				"2024-00-15.md", // Invalid month (0)
				"regular-note.md", // No date pattern
				"2024.md", // Incomplete date
			];

			invalidPaths.forEach((path) => {
				const result = service.extractDailyNoteDate(path);
				expect(result).toBeNull();
			});
		});

		it("should validate leap years correctly", () => {
			// 2024 is a leap year
			const leapYearDate = service.extractDailyNoteDate("2024-02-29.md");
			expect(leapYearDate).toEqual(new Date(2024, 1, 29));

			// 2023 is not a leap year
			const nonLeapYearDate = service.extractDailyNoteDate("2023-02-29.md");
			expect(nonLeapYearDate).toBeNull();
		});
	});

	describe("resolveDateForTimeOnly", () => {
		let mockTask: Task;
		let mockTimeComponent: TimeComponent;

		beforeEach(() => {
			mockTask = {
				id: "test-task",
				content: "Test task 12:00～13:00",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Test task 12:00～13:00",
				metadata: {
					tags: [],
					children: [],
				},
			} as Task;

			mockTimeComponent = {
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
		});

		it("should prioritize current line date (Priority 1)", async () => {
			const context: DateResolutionContext = {
				currentLine: "- [ ] Meeting 2024-03-15 12:00～13:00",
				filePath: "test.md",
				lineNumber: 1,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("line-date");
			expect(result.confidence).toBe("high");
			expect(result.usedFallback).toBe(false);
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
		});

		it("should use parent task date when no line date (Priority 2)", async () => {
			const parentTask: Task = {
				...mockTask,
				id: "parent-task",
				metadata: {
					...mockTask.metadata,
					startDate: new Date(2024, 2, 10).getTime(),
				},
			};

			const context: DateResolutionContext = {
				currentLine: "- [ ] Subtask 12:00～13:00",
				filePath: "test.md",
				parentTask,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.confidence).toBe("high");
			expect(result.usedFallback).toBe(false);
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 10));
		});

		it("should use daily note date when available (Priority 3)", async () => {
			// Mock file operations
			const mockFile = { path: "2024-03-20.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date(2024, 2, 20).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "- [ ] Task 12:00～13:00",
				filePath: "2024-03-20.md",
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("daily-note-date");
			expect(result.confidence).toBe("high");
			expect(result.usedFallback).toBe(false);
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 20));
		});

		it("should use file metadata date when available (Priority 3)", async () => {
			// Mock file operations
			const mockFile = { path: "regular-note.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: {
					date: "2024-03-18",
				},
			});

			const context: DateResolutionContext = {
				currentLine: "- [ ] Task 12:00～13:00",
				filePath: "regular-note.md",
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("metadata-date");
			expect(result.confidence).toBe("medium");
			expect(result.usedFallback).toBe(false);
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 18));
		});

		it("should fall back to file creation time (Priority 4)", async () => {
			// Mock file operations
			const mockFile = { path: "regular-note.md" };
			const ctimeDate = new Date(2024, 2, 5);
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: ctimeDate.getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: null,
			});

			const context: DateResolutionContext = {
				currentLine: "- [ ] Task 12:00～13:00",
				filePath: "regular-note.md",
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("file-ctime");
			expect(result.confidence).toBe("low");
			expect(result.usedFallback).toBe(true);
			expect(result.resolvedDate).toEqual(ctimeDate);
		});

		it("should handle natural language dates in lines", async () => {
			const testCases = [
				{ line: "- [ ] Meeting tomorrow 12:00～13:00", expectedDaysOffset: 1 },
				{ line: "- [ ] Call today 12:00～13:00", expectedDaysOffset: 0 },
				{ line: "- [ ] Review yesterday 12:00～13:00", expectedDaysOffset: -1 },
			];

			for (const { line, expectedDaysOffset } of testCases) {
				const context: DateResolutionContext = {
					currentLine: line,
					filePath: "test.md",
				};

				const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);
				
				const expectedDate = new Date();
				expectedDate.setDate(expectedDate.getDate() + expectedDaysOffset);
				
				expect(result.source).toBe("line-date");
				expect(result.resolvedDate.toDateString()).toBe(expectedDate.toDateString());
			}
		});

		it("should handle weekday references in lines", async () => {
			const context: DateResolutionContext = {
				currentLine: "- [ ] Meeting monday 12:00～13:00",
				filePath: "test.md",
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("line-date");
			expect(result.resolvedDate.getDay()).toBe(1); // Monday
		});
	});

	describe("getFileDateInfo caching", () => {
		it("should cache file date info", async () => {
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 1).getTime(),
				mtime: new Date(2024, 2, 15).getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({
				frontmatter: { date: "2024-03-10" },
			});

			// First call
			const result1 = await service.getFileDateInfo("test.md");
			
			// Second call should use cache
			const result2 = await service.getFileDateInfo("test.md");

			expect(mockVault.adapter.stat).toHaveBeenCalledTimes(1);
			expect(result1).toEqual(result2);
		});

		it("should respect cache size limits", async () => {
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date().getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({ frontmatter: null });

			// Fill cache beyond limit (MAX_CACHE_SIZE = 500)
			// We'll test with a smaller number for practical testing
			const testFiles = Array.from({ length: 10 }, (_, i) => `test-${i}.md`);
			
			for (const filePath of testFiles) {
				await service.getFileDateInfo(filePath);
			}

			const stats = service.getCacheStats();
			expect(stats.size).toBeLessThanOrEqual(stats.maxSize);
		});
	});

	describe("metadata date parsing", () => {
		it("should parse various metadata date formats", async () => {
			const testCases = [
				{ frontmatter: { date: "2024-03-15" }, expected: new Date(2024, 2, 15) },
				{ frontmatter: { created: "2024-03-15" }, expected: new Date(2024, 2, 15) },
				{ frontmatter: { "creation-date": "2024-03-15" }, expected: new Date(2024, 2, 15) },
				{ frontmatter: { day: 1710460800000 }, expected: new Date(1710460800000) }, // timestamp
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
				expect(result.metadataDate).toEqual(expected);
				
				// Clear cache for next test
				service.clearCache();
			}
		});

		it("should handle invalid metadata dates gracefully", async () => {
			const invalidFrontmatters = [
				{ date: "invalid-date" },
				{ date: null },
				{ date: {} },
				{ date: "2024-13-45" }, // Invalid date
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
	});

	describe("parent task date inheritance", () => {
		let mockTask: Task;
		let mockTimeComponent: TimeComponent;

		beforeEach(() => {
			mockTask = {
				id: "test-task",
				content: "Test task 12:00～13:00",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Test task 12:00～13:00",
				metadata: {
					tags: [],
					children: [],
				},
			} as Task;

			mockTimeComponent = {
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
		});

		it("should prioritize startDate from parent task", async () => {
			const parentTask: Task = {
				id: "parent",
				content: "Parent task",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Parent task",
				metadata: {
					tags: [],
					children: [],
					startDate: new Date(2024, 2, 10).getTime(),
					dueDate: new Date(2024, 2, 15).getTime(),
					scheduledDate: new Date(2024, 2, 12).getTime(),
				},
			} as Task;

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 12:00～13:00",
				filePath: "test.md",
				parentTask,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 10));
		});

		it("should fall back to dueDate if no startDate", async () => {
			const parentTask: Task = {
				id: "parent",
				content: "Parent task",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Parent task",
				metadata: {
					tags: [],
					children: [],
					dueDate: new Date(2024, 2, 15).getTime(),
					scheduledDate: new Date(2024, 2, 12).getTime(),
				},
			} as Task;

			const context: DateResolutionContext = {
				currentLine: "  - [ ] Child task 12:00～13:00",
				filePath: "test.md",
				parentTask,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("parent-task");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
		});
	});

	describe("line context analysis", () => {
		let mockTask: Task;
		let mockTimeComponent: TimeComponent;

		beforeEach(() => {
			mockTask = {
				id: "test-task",
				content: "Test task 12:00～13:00",
				filePath: "test.md",
				line: 1,
				completed: false,
				status: "todo",
				originalMarkdown: "- [ ] Test task 12:00～13:00",
				metadata: {
					tags: [],
					children: [],
				},
			} as Task;

			mockTimeComponent = {
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
		});

		it("should find dates in nearby lines when provided context", async () => {
			const allLines = [
				"# Meeting Notes 2024-03-15",
				"",
				"- [ ] Preparation 10:00～11:00",
				"- [ ] Main meeting 12:00～13:00", // Current line
				"- [ ] Follow-up 14:00～15:00",
			];

			const context: DateResolutionContext = {
				currentLine: "- [ ] Main meeting 12:00～13:00",
				filePath: "test.md",
				lineNumber: 3,
				allLines,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			expect(result.source).toBe("line-date");
			expect(result.resolvedDate).toEqual(new Date(2024, 2, 15));
		});

		it("should not find dates beyond search range", async () => {
			const allLines = [
				"# Old Meeting Notes 2024-03-01", // Too far away
				"",
				"",
				"",
				"",
				"- [ ] Main meeting 12:00～13:00", // Current line (index 5)
			];

			// Mock file operations for fallback
			const mockFile = { path: "test.md" };
			mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
			mockVault.adapter.stat.mockResolvedValue({
				ctime: new Date(2024, 2, 10).getTime(),
				mtime: new Date().getTime(),
			});
			mockMetadataCache.getFileCache.mockReturnValue({ frontmatter: null });

			const context: DateResolutionContext = {
				currentLine: "- [ ] Main meeting 12:00～13:00",
				filePath: "test.md",
				lineNumber: 5,
				allLines,
			};

			const result = await service.resolveDateForTimeOnly(mockTask, mockTimeComponent, context);

			// Should fall back to file ctime since date is too far away
			expect(result.source).toBe("file-ctime");
		});
	});
});