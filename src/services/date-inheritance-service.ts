/**
 * Date Inheritance Service for Time-Only Expressions
 * 
 * This service handles date resolution for time-only expressions (like "12:00～13:00")
 * by implementing a priority-based inheritance system:
 * 1. Current line date > file metadata date = daily note title date > file ctime
 * 2. Parent task date inheritance for hierarchical structures
 * 3. Efficient caching to avoid frequent file system calls
 */

import { App, TFile, Vault, MetadataCache } from "obsidian";
import { TimeComponent } from "../types/time-parsing";
import type { Task } from "../types/task";

/**
 * Context information for date resolution
 */
export interface DateResolutionContext {
	/** Current line being parsed */
	currentLine: string;
	/** File path of the task */
	filePath: string;
	/** Parent task information for inheritance */
	parentTask?: Task;
	/** File metadata cache */
	fileMetadataCache?: Map<string, FileDateInfo>;
	/** Line number in the file */
	lineNumber?: number;
	/** All lines in the file for context analysis */
	allLines?: string[];
	/** All tasks in the file for hierarchical parent inheritance */
	allTasks?: Task[];
}

/**
 * File date information structure
 */
export interface FileDateInfo {
	/** File creation time */
	ctime: Date;
	/** Date from file metadata/frontmatter */
	metadataDate?: Date;
	/** Date extracted from daily note title/path */
	dailyNoteDate?: Date;
	/** Whether this file is identified as a daily note */
	isDailyNote: boolean;
	/** Cache timestamp */
	cachedAt: Date;
	/** File modification time for cache validation */
	mtime: number;
}

/**
 * Date priority resolution result
 */
export interface DateResolutionResult {
	/** Resolved date */
	resolvedDate: Date;
	/** Source of the date */
	source: "line-date" | "metadata-date" | "daily-note-date" | "file-ctime" | "parent-task";
	/** Confidence level of the resolution */
	confidence: "high" | "medium" | "low";
	/** Whether fallback was used */
	usedFallback: boolean;
	/** Additional context about the resolution */
	context?: string;
}

/**
 * Service for handling date inheritance for time-only expressions
 */
export class DateInheritanceService {
	private fileDateCache = new Map<string, FileDateInfo>();
	private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
	private readonly MAX_CACHE_SIZE = 500;

	// Daily note patterns for different date formats and common naming conventions
	// Order matters - more specific patterns should come first
	private readonly DAILY_NOTE_PATTERNS = [
		// Week format: YYYY-W## (must come before YYYY-MM)
		{ pattern: /(\d{4})-W(\d{2})/, format: "YYYY-W##" },
		// Standard ISO format: YYYY-MM-DD
		{ pattern: /(\d{4})-(\d{2})-(\d{2})/, format: "YYYY-MM-DD" },
		// Dot separated: YYYY.MM.DD
		{ pattern: /(\d{4})\.(\d{2})\.(\d{2})/, format: "YYYY.MM.DD" },
		// Underscore separated: YYYY_MM_DD
		{ pattern: /(\d{4})_(\d{2})_(\d{2})/, format: "YYYY_MM_DD" },
		// Compact format: YYYYMMDD (be careful with this one)
		{ pattern: /(\d{4})(\d{2})(\d{2})/, format: "YYYYMMDD" },
		// US format: MM-DD-YYYY
		{ pattern: /(\d{2})-(\d{2})-(\d{4})/, format: "MM-DD-YYYY" },
		// European format: DD.MM.YYYY
		{ pattern: /(\d{2})\.(\d{2})\.(\d{4})/, format: "DD.MM.YYYY" },
		// Alternative US format: MM/DD/YYYY
		{ pattern: /(\d{2})\/(\d{2})\/(\d{4})/, format: "MM/DD/YYYY" },
		// Alternative European format: DD/MM/YYYY (ambiguous with US, will use context)
		{ pattern: /(\d{2})\/(\d{2})\/(\d{4})/, format: "DD/MM/YYYY" },
		// Year-month format: YYYY-MM (for monthly notes) - must come after YYYY-MM-DD
		// Use negative lookahead to avoid matching YYYY-MM-DD patterns
		{ pattern: /(\d{4})-(\d{2})(?!-\d{2})/, format: "YYYY-MM" },
	];

	// Common daily note folder patterns
	private readonly DAILY_NOTE_FOLDER_PATTERNS = [
		/daily\s*notes?/i,
		/journal/i,
		/diary/i,
		/log/i,
		/\d{4}\/\d{2}/, // Year/Month structure
		/\d{4}-\d{2}/, // Year-Month structure
	];

	// File metadata property names that commonly contain dates
	private readonly DATE_PROPERTY_NAMES = [
		// Standard properties
		'date', 'created', 'creation-date', 'created-date', 'creation_date',
		'day', 'daily-note-date', 'note-date', 'file-date',
		// Obsidian properties
		'created-at', 'created_at', 'createdAt',
		'modified', 'modified-date', 'modified_date', 'updated', 'updated-date',
		// Custom properties
		'publish-date', 'publish_date', 'publishDate',
		'event-date', 'event_date', 'eventDate',
		'due-date', 'due_date', 'dueDate',
		'start-date', 'start_date', 'startDate',
		// Templater and other plugin properties
		'tp.date', 'tp.file.creation_date', 'tp.file.last_modified_date',
		// Dataview properties
		'file.ctime', 'file.mtime', 'file.cday', 'file.mday',
	];

	// Date patterns for line-level date detection
	private readonly LINE_DATE_PATTERNS = [
		// Standard date formats
		/\b(\d{4})-(\d{2})-(\d{2})\b/,
		/\b(\d{2})\/(\d{2})\/(\d{4})\b/,
		/\b(\d{2})-(\d{2})-(\d{4})\b/,
		// Natural language dates (basic patterns)
		/\b(today|tomorrow|yesterday)\b/i,
		/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
	];

	constructor(
		private app: App,
		private vault: Vault,
		private metadataCache: MetadataCache
	) {}

	/**
	 * Resolve date for time-only expressions using priority logic
	 */
	async resolveDateForTimeOnly(
		task: Task,
		timeComponent: TimeComponent,
		context: DateResolutionContext
	): Promise<DateResolutionResult> {
		// Priority 1: Current line date
		const lineDate = this.extractDateFromLine(context.currentLine, context.lineNumber, context.allLines);
		if (lineDate) {
			return {
				resolvedDate: lineDate,
				source: "line-date",
				confidence: "high",
				usedFallback: false,
				context: "Found explicit date in current line"
			};
		}

		// Priority 2: Parent task date inheritance (with hierarchical support)
		if (context.parentTask) {
			try {
				const hierarchicalResult = await this.extractDateFromParentHierarchy(
					context.parentTask,
					context
				);
				
				if (hierarchicalResult) {
					const confidence = hierarchicalResult.depth === 0 ? "high" : 
									 hierarchicalResult.depth === 1 ? "medium" : "low";
					
					return {
						resolvedDate: hierarchicalResult.date,
						source: "parent-task",
						confidence,
						usedFallback: false,
						context: `Inherited from ${hierarchicalResult.source} (depth: ${hierarchicalResult.depth})`
					};
				}
			} catch (error) {
				console.warn('[DateInheritanceService] Error in hierarchical parent date extraction:', error);
				// Fall back to simple parent extraction
				const parentDate = this.extractDateFromParentTask(context.parentTask);
				if (parentDate) {
					return {
						resolvedDate: parentDate,
						source: "parent-task",
						confidence: "high",
						usedFallback: false,
						context: "Inherited from parent task (fallback)"
					};
				}
			}
		}

		// Priority 3: File metadata date = daily note title date (equal priority)
		const fileDateInfo = await this.getFileDateInfo(context.filePath);
		
		// Check daily note date first (slightly higher confidence for explicit daily notes)
		if (fileDateInfo.dailyNoteDate && fileDateInfo.isDailyNote) {
			return {
				resolvedDate: fileDateInfo.dailyNoteDate,
				source: "daily-note-date",
				confidence: "high",
				usedFallback: false,
				context: "Extracted from daily note title/path"
			};
		}

		// Check file metadata date
		if (fileDateInfo.metadataDate) {
			return {
				resolvedDate: fileDateInfo.metadataDate,
				source: "metadata-date",
				confidence: "medium",
				usedFallback: false,
				context: "Found in file frontmatter/properties"
			};
		}

		// Check daily note date for non-daily note files
		if (fileDateInfo.dailyNoteDate) {
			return {
				resolvedDate: fileDateInfo.dailyNoteDate,
				source: "daily-note-date",
				confidence: "medium",
				usedFallback: false,
				context: "Extracted from file path date pattern"
			};
		}

		// Priority 4: File creation time (fallback)
		return {
			resolvedDate: fileDateInfo.ctime,
			source: "file-ctime",
			confidence: "low",
			usedFallback: true,
			context: "Using file creation time as fallback"
		};
	}

	/**
	 * Get file-based date information with caching
	 */
	async getFileDateInfo(filePath: string): Promise<FileDateInfo> {
		// Check cache first
		const cached = this.fileDateCache.get(filePath);
		if (cached && this.isCacheValid(cached)) {
			return cached;
		}

		// Get file stats
		const file = this.vault.getAbstractFileByPath(filePath) as TFile;
		if (!file) {
			// Return default info for non-existent files
			return {
				ctime: new Date(),
				dailyNoteDate: undefined,
				metadataDate: undefined,
				isDailyNote: false,
				cachedAt: new Date(),
				mtime: 0
			};
		}

		const fileStat = await this.vault.adapter.stat(filePath);
		const ctime = new Date(fileStat?.ctime || Date.now());
		const mtime = fileStat?.mtime || 0;

		// Extract daily note date from file path/title
		const dailyNoteDateResult = this.extractDailyNoteDate(filePath);
		const dailyNoteDate = dailyNoteDateResult ?? undefined;
		const isDailyNote = dailyNoteDateResult !== null;

		// Extract metadata date from frontmatter
		const metadataDateResult = await this.extractMetadataDate(file);
		const metadataDate = metadataDateResult ?? undefined;

		const fileDateInfo: FileDateInfo = {
			ctime,
			metadataDate,
			dailyNoteDate,
			isDailyNote,
			cachedAt: new Date(),
			mtime
		};

		// Cache the result
		this.cacheFileDateInfo(filePath, fileDateInfo);

		return fileDateInfo;
	}

	/**
	 * Extract daily note date from file path/title with enhanced pattern matching
	 */
	public extractDailyNoteDate(filePath: string): Date | null {
		const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || '';
		const fullPath = filePath;
		const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));

		// Check if this looks like a daily note based on folder structure
		const isDailyNoteFolder = this.isDailyNoteFolder(folderPath);

		// Try each pattern on filename first, then full path
		for (const { pattern, format } of this.DAILY_NOTE_PATTERNS) {
			// Try filename first
			let match = fileName.match(pattern);
			let matchSource = 'filename';
			
			if (!match) {
				// Try full path
				match = fullPath.match(pattern);
				matchSource = 'fullpath';
			}

			if (match) {
				try {
					const date = this.parseDateFromPatternMatch(match, format, isDailyNoteFolder);
					if (date) {
						// Additional validation for daily notes
						if (this.isValidDailyNoteDate(date, filePath, matchSource)) {
							return date;
						}
					}
				} catch (error) {
					// Continue to next pattern if parsing fails
					continue;
				}
			}
		}

		return null;
	}

	/**
	 * Check if folder path indicates this is likely a daily note
	 */
	private isDailyNoteFolder(folderPath: string): boolean {
		if (!folderPath) return false;

		const lowerPath = folderPath.toLowerCase();
		return this.DAILY_NOTE_FOLDER_PATTERNS.some(pattern => pattern.test(lowerPath));
	}

	/**
	 * Parse date from pattern match based on format
	 */
	private parseDateFromPatternMatch(match: RegExpMatchArray, format: string, isDailyNoteFolder: boolean): Date | null {
		let year: number, month: number, day: number;

		switch (format) {
			case "YYYY-MM-DD":
			case "YYYY.MM.DD":
			case "YYYY_MM_DD":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				break;

			case "YYYYMMDD":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				break;

			case "MM-DD-YYYY":
			case "MM/DD/YYYY":
				month = parseInt(match[1], 10);
				day = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
				break;

			case "DD.MM.YYYY":
			case "DD/MM/YYYY":
				day = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
				break;

			case "YYYY-MM":
				// Monthly note - use first day of month
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = 1;
				break;

			case "YYYY-W##":
				// Weekly note - calculate date from week number
				year = parseInt(match[1], 10);
				const weekNum = parseInt(match[2], 10);
				return this.getDateFromWeekNumber(year, weekNum);

			default:
				return null;
		}

		// Handle ambiguous DD/MM vs MM/DD formats
		if (format === "DD/MM/YYYY" || format === "MM/DD/YYYY") {
			// Use context clues to determine format
			const preferEuropean = isDailyNoteFolder && this.detectEuropeanDatePreference();
			
			if (format === "DD/MM/YYYY" && !preferEuropean) {
				// Switch to MM/DD interpretation
				[month, day] = [day, month];
			}
		}

		// Validate date components
		if (year >= 1900 && year <= 2100 && 
			month >= 1 && month <= 12 && 
			day >= 1 && day <= 31) {
			const date = new Date(year, month - 1, day); // month is 0-indexed
			
			// Verify the date is valid (handles invalid dates like Feb 30)
			if (date.getFullYear() === year && 
				date.getMonth() === month - 1 && 
				date.getDate() === day) {
				return date;
			}
		}

		return null;
	}

	/**
	 * Get date from ISO week number
	 */
	private getDateFromWeekNumber(year: number, week: number): Date | null {
		if (week < 1 || week > 53) return null;

		// January 4th is always in week 1
		const jan4 = new Date(year, 0, 4);
		const jan4Day = jan4.getDay() || 7; // Sunday = 7, Monday = 1
		
		// Calculate the Monday of week 1
		const week1Monday = new Date(jan4);
		week1Monday.setDate(jan4.getDate() - jan4Day + 1);
		
		// Calculate the target week's Monday
		const targetDate = new Date(week1Monday);
		targetDate.setDate(week1Monday.getDate() + (week - 1) * 7);
		
		return targetDate;
	}

	/**
	 * Detect if European date format (DD/MM) is preferred based on context
	 */
	private detectEuropeanDatePreference(): boolean {
		// This could be enhanced with user settings or locale detection
		// For now, return false (prefer US format MM/DD)
		return false;
	}

	/**
	 * Validate if the extracted date makes sense for a daily note
	 */
	private isValidDailyNoteDate(date: Date, filePath: string, matchSource: string): boolean {
		// Allow a very wide range for daily notes to accommodate various use cases
		// including historical research, archival notes, and future planning
		const minDate = new Date(1900, 0, 1);
		const maxDate = new Date(2100, 11, 31);
		
		// Basic sanity check - date should be within reasonable bounds
		if (date < minDate || date > maxDate) {
			return false;
		}

		// Additional validation could be added here based on specific requirements
		// For now, we'll be permissive to support various use cases
		return true;
	}

	/**
	 * Extract metadata date from file frontmatter/properties with comprehensive property support
	 */
	private async extractMetadataDate(file: TFile): Promise<Date | null> {
		const fileCache = this.metadataCache.getFileCache(file);
		const frontmatter = fileCache?.frontmatter;

		if (!frontmatter) {
			return null;
		}

		// Try each date property in order of preference
		for (const prop of this.DATE_PROPERTY_NAMES) {
			const value = frontmatter[prop];
			if (value !== undefined && value !== null) {
				const date = this.parseMetadataDate(value, prop);
				if (date) {
					return date;
				}
			}
		}

		// Also check for nested properties (e.g., file.ctime in Dataview)
		const nestedDate = this.extractNestedMetadataDate(frontmatter);
		if (nestedDate) {
			return nestedDate;
		}

		return null;
	}

	/**
	 * Extract dates from nested metadata properties
	 */
	private extractNestedMetadataDate(frontmatter: Record<string, any>): Date | null {
		// Check for Dataview file properties
		if (frontmatter.file) {
			const fileProps = frontmatter.file;
			const dateProps = ['ctime', 'mtime', 'cday', 'mday', 'created', 'modified'];
			
			for (const prop of dateProps) {
				if (fileProps[prop]) {
					const date = this.parseMetadataDate(fileProps[prop], `file.${prop}`);
					if (date) {
						return date;
					}
				}
			}
		}

		// Check for Templater properties
		if (frontmatter.tp) {
			const tpProps = frontmatter.tp;
			if (tpProps.date) {
				const date = this.parseMetadataDate(tpProps.date, 'tp.date');
				if (date) {
					return date;
				}
			}
			
			if (tpProps.file) {
				const tpFileProps = tpProps.file;
				const dateProps = ['creation_date', 'last_modified_date'];
				
				for (const prop of dateProps) {
					if (tpFileProps[prop]) {
						const date = this.parseMetadataDate(tpFileProps[prop], `tp.file.${prop}`);
						if (date) {
							return date;
						}
					}
				}
			}
		}

		return null;
	}

	/**
	 * Parse various metadata date formats with enhanced support
	 */
	private parseMetadataDate(value: any, propertyName?: string): Date | null {
		if (!value) return null;

		// Handle different value types
		if (value instanceof Date) {
			return value;
		}

		if (typeof value === 'number') {
			// Assume timestamp
			return new Date(value);
		}

		if (typeof value === 'string') {
			// Handle special string formats first
			const trimmedValue = value.trim();
			
			// Handle relative dates
			if (this.isRelativeDateString(trimmedValue)) {
				const relativeDate = this.parseRelativeDateString(trimmedValue);
				if (relativeDate) {
					return relativeDate;
				}
			}

			// Handle natural language dates
			if (this.isNaturalLanguageDate(trimmedValue)) {
				const naturalDate = this.parseNaturalLanguageDate(trimmedValue);
				if (naturalDate) {
					return naturalDate;
				}
			}

			// Try common date formats with enhanced pattern matching
			const datePatterns = [
				{ pattern: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/, format: "ISO_DATETIME" },
				{ pattern: /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/, format: "ISO_DATETIME_SHORT" },
				{ pattern: /^(\d{4})-(\d{2})-(\d{2})$/, format: "YYYY-MM-DD" },
				{ pattern: /^(\d{2})\/(\d{2})\/(\d{4})$/, format: "MM/DD/YYYY" },
				{ pattern: /^(\d{2})-(\d{2})-(\d{4})$/, format: "DD-MM-YYYY" },
				{ pattern: /^(\d{4})\.(\d{2})\.(\d{2})$/, format: "YYYY.MM.DD" },
				{ pattern: /^(\d{2})\.(\d{2})\.(\d{4})$/, format: "DD.MM.YYYY" },
				{ pattern: /^(\d{4})\/(\d{2})\/(\d{2})$/, format: "YYYY/MM/DD" },
				{ pattern: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, format: "M/D/YYYY" },
				{ pattern: /^(\d{4})(\d{2})(\d{2})$/, format: "YYYYMMDD" },
			];

			for (const { pattern, format } of datePatterns) {
				const match = trimmedValue.match(pattern);
				if (match) {
					try {
						const date = this.parseDateFromFormat(match, format);
						if (date && this.isValidMetadataDate(date, propertyName)) {
							return date;
						}
					} catch (error) {
						continue;
					}
				}
			}

			// Try parsing as ISO date as fallback
			try {
				const isoDate = new Date(trimmedValue);
				if (!isNaN(isoDate.getTime()) && this.isValidMetadataDate(isoDate, propertyName)) {
					return isoDate;
				}
			} catch (error) {
				// Continue to next attempt
			}

			// Try parsing with Date.parse as final fallback
			try {
				const parsedTime = Date.parse(trimmedValue);
				if (!isNaN(parsedTime)) {
					const date = new Date(parsedTime);
					if (this.isValidMetadataDate(date, propertyName)) {
						return date;
					}
				}
			} catch (error) {
				// Final fallback failed
			}
		}

		return null;
	}

	/**
	 * Extract date from current line context
	 */
	private extractDateFromLine(currentLine: string, lineNumber?: number, allLines?: string[]): Date | null {
		// First check the current line itself
		for (const pattern of this.LINE_DATE_PATTERNS) {
			const match = currentLine.match(pattern);
			if (match) {
				const date = this.parseDateFromMatch(match, pattern);
				if (date) {
					return date;
				}
			}
		}

		// If we have context of all lines, check nearby lines (within 3 lines)
		if (allLines && lineNumber !== undefined) {
			const searchRange = 3;
			const startLine = Math.max(0, lineNumber - searchRange);
			const endLine = Math.min(allLines.length - 1, lineNumber + searchRange);

			for (let i = startLine; i <= endLine; i++) {
				if (i === lineNumber) continue; // Already checked current line

				const line = allLines[i];
				for (const pattern of this.LINE_DATE_PATTERNS) {
					const match = line.match(pattern);
					if (match) {
						const date = this.parseDateFromMatch(match, pattern);
						if (date) {
							return date;
						}
					}
				}
			}
		}

		return null;
	}

	/**
	 * Parse date from regex match
	 */
	private parseDateFromMatch(match: RegExpMatchArray, pattern: RegExp): Date | null {
		try {
			const matchStr = match[0].toLowerCase();

			// Handle natural language dates
			if (matchStr === 'today') {
				return new Date();
			} else if (matchStr === 'tomorrow') {
				const tomorrow = new Date();
				tomorrow.setDate(tomorrow.getDate() + 1);
				return tomorrow;
			} else if (matchStr === 'yesterday') {
				const yesterday = new Date();
				yesterday.setDate(yesterday.getDate() - 1);
				return yesterday;
			}

			// Handle weekdays (find next occurrence)
			const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
			const weekdayIndex = weekdays.indexOf(matchStr);
			if (weekdayIndex !== -1) {
				const today = new Date();
				const currentDay = today.getDay();
				let daysToAdd = weekdayIndex - currentDay;
				if (daysToAdd <= 0) {
					daysToAdd += 7; // Next week
				}
				const targetDate = new Date(today);
				targetDate.setDate(today.getDate() + daysToAdd);
				return targetDate;
			}

			// Handle numeric date patterns
			if (match.length >= 4) {
				let year: number, month: number, day: number;

				if (pattern.source.includes('(\\d{4})-(\\d{2})-(\\d{2})')) {
					// YYYY-MM-DD
					year = parseInt(match[1], 10);
					month = parseInt(match[2], 10);
					day = parseInt(match[3], 10);
				} else if (pattern.source.includes('(\\d{2})\\/(\\d{2})\\/(\\d{4})')) {
					// MM/DD/YYYY
					month = parseInt(match[1], 10);
					day = parseInt(match[2], 10);
					year = parseInt(match[3], 10);
				} else if (pattern.source.includes('(\\d{2})-(\\d{2})-(\\d{4})')) {
					// DD-MM-YYYY
					day = parseInt(match[1], 10);
					month = parseInt(match[2], 10);
					year = parseInt(match[3], 10);
				} else {
					return null;
				}

				const date = new Date(year, month - 1, day);
				if (!isNaN(date.getTime())) {
					return date;
				}
			}
		} catch (error) {
			// Continue if parsing fails
		}

		return null;
	}

	/**
	 * Extract date from parent task with hierarchical inheritance support
	 */
	private extractDateFromParentTask(parentTask: Task): Date | null {
		// Check various date fields in priority order
		// Priority 1: Explicit dates on the parent task
		if (parentTask.metadata.startDate) {
			return new Date(parentTask.metadata.startDate);
		}
		if (parentTask.metadata.dueDate) {
			return new Date(parentTask.metadata.dueDate);
		}
		if (parentTask.metadata.scheduledDate) {
			return new Date(parentTask.metadata.scheduledDate);
		}

		// Priority 2: Enhanced datetime objects (if available)
		const enhancedMetadata = parentTask.metadata as any;
		if (enhancedMetadata.enhancedDates) {
			if (enhancedMetadata.enhancedDates.startDateTime) {
				return new Date(enhancedMetadata.enhancedDates.startDateTime);
			}
			if (enhancedMetadata.enhancedDates.dueDateTime) {
				return new Date(enhancedMetadata.enhancedDates.dueDateTime);
			}
			if (enhancedMetadata.enhancedDates.scheduledDateTime) {
				return new Date(enhancedMetadata.enhancedDates.scheduledDateTime);
			}
		}

		// Priority 3: Creation date as fallback
		if (parentTask.metadata.createdDate) {
			return new Date(parentTask.metadata.createdDate);
		}

		return null;
	}

	/**
	 * Extract date from parent task hierarchy with recursive inheritance
	 * This method supports multi-level inheritance (parent -> grandparent -> etc.)
	 */
	async extractDateFromParentHierarchy(
		parentTask: Task,
		context: DateResolutionContext,
		maxDepth: number = 3,
		currentDepth: number = 0
	): Promise<{ date: Date; source: string; depth: number } | null> {
		if (currentDepth >= maxDepth) {
			return null;
		}

		// Try to get date from current parent
		const parentDate = this.extractDateFromParentTask(parentTask);
		if (parentDate) {
			return {
				date: parentDate,
				source: `parent-task-L${currentDepth}`,
				depth: currentDepth
			};
		}

		// If parent doesn't have a date, try to find the parent's parent
		// This requires access to all tasks in the context
		if (context.allTasks && parentTask.metadata.parent) {
			const grandparentTask = context.allTasks.find(
				task => task.id === parentTask.metadata.parent
			);
			
			if (grandparentTask) {
				// Recursively check grandparent
				const grandparentResult = await this.extractDateFromParentHierarchy(
					grandparentTask,
					context,
					maxDepth,
					currentDepth + 1
				);
				
				if (grandparentResult) {
					return grandparentResult;
				}
			}
		}

		return null;
	}

	/**
	 * Check if cache entry is still valid
	 */
	private isCacheValid(cached: FileDateInfo): boolean {
		const now = Date.now();
		const cacheAge = now - cached.cachedAt.getTime();
		return cacheAge < this.CACHE_TTL;
	}

	/**
	 * Cache file date info with LRU eviction
	 */
	private cacheFileDateInfo(filePath: string, info: FileDateInfo): void {
		// Implement LRU eviction
		if (this.fileDateCache.size >= this.MAX_CACHE_SIZE) {
			// Remove oldest entry
			const firstKey = this.fileDateCache.keys().next().value;
			if (firstKey) {
				this.fileDateCache.delete(firstKey);
			}
		}

		this.fileDateCache.set(filePath, info);
	}

	/**
	 * Clear the cache (useful for testing or settings changes)
	 */
	clearCache(): void {
		this.fileDateCache.clear();
	}

	/**
	 * Check if string represents a relative date
	 */
	private isRelativeDateString(value: string): boolean {
		const relativeDatePatterns = [
			/^today$/i,
			/^tomorrow$/i,
			/^yesterday$/i,
			/^now$/i,
			/^\+\d+[dwmy]$/i, // +1d, +2w, +1m, +1y
			/^-\d+[dwmy]$/i,  // -1d, -2w, -1m, -1y
		];

		return relativeDatePatterns.some(pattern => pattern.test(value));
	}

	/**
	 * Parse relative date strings
	 */
	private parseRelativeDateString(value: string): Date | null {
		const now = new Date();
		const lowerValue = value.toLowerCase();

		switch (lowerValue) {
			case 'today':
			case 'now':
				return new Date(now.getFullYear(), now.getMonth(), now.getDate());
			case 'tomorrow':
				return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
			case 'yesterday':
				return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
		}

		// Handle +/-N[dwmy] format
		const offsetMatch = value.match(/^([+-])(\d+)([dwmy])$/i);
		if (offsetMatch) {
			const sign = offsetMatch[1] === '+' ? 1 : -1;
			const amount = parseInt(offsetMatch[2], 10) * sign;
			const unit = offsetMatch[3].toLowerCase();

			const result = new Date(now);
			switch (unit) {
				case 'd':
					result.setDate(result.getDate() + amount);
					break;
				case 'w':
					result.setDate(result.getDate() + amount * 7);
					break;
				case 'm':
					result.setMonth(result.getMonth() + amount);
					break;
				case 'y':
					result.setFullYear(result.getFullYear() + amount);
					break;
			}
			return result;
		}

		return null;
	}

	/**
	 * Check if string represents natural language date
	 */
	private isNaturalLanguageDate(value: string): boolean {
		const naturalPatterns = [
			/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
			/^(next|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
			/^(next|last)\s+(week|month|year)$/i,
			/^(this|next|last)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
		];

		return naturalPatterns.some(pattern => pattern.test(value));
	}

	/**
	 * Parse natural language date strings
	 */
	private parseNaturalLanguageDate(value: string): Date | null {
		const now = new Date();
		const lowerValue = value.toLowerCase().trim();

		// Handle weekdays
		const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const weekdayMatch = lowerValue.match(/^(?:(next|last|this)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i);
		
		if (weekdayMatch) {
			const modifier = weekdayMatch[1]?.toLowerCase();
			const weekdayName = weekdayMatch[2].toLowerCase();
			const targetWeekday = weekdays.indexOf(weekdayName);
			
			if (targetWeekday !== -1) {
				const currentWeekday = now.getDay();
				let daysToAdd = targetWeekday - currentWeekday;
				
				if (modifier === 'next') {
					if (daysToAdd <= 0) daysToAdd += 7;
				} else if (modifier === 'last') {
					if (daysToAdd >= 0) daysToAdd -= 7;
				} else if (modifier === 'this') {
					// Keep as is
				} else {
					// No modifier - assume next occurrence
					if (daysToAdd <= 0) daysToAdd += 7;
				}
				
				const result = new Date(now);
				result.setDate(now.getDate() + daysToAdd);
				return result;
			}
		}

		// Handle other natural language patterns
		if (lowerValue === 'next week') {
			const result = new Date(now);
			result.setDate(now.getDate() + 7);
			return result;
		} else if (lowerValue === 'last week') {
			const result = new Date(now);
			result.setDate(now.getDate() - 7);
			return result;
		} else if (lowerValue === 'next month') {
			const result = new Date(now);
			result.setMonth(now.getMonth() + 1);
			return result;
		} else if (lowerValue === 'last month') {
			const result = new Date(now);
			result.setMonth(now.getMonth() - 1);
			return result;
		}

		return null;
	}

	/**
	 * Parse date from format-specific match
	 */
	private parseDateFromFormat(match: RegExpMatchArray, format: string): Date | null {
		let year: number, month: number, day: number, hour = 0, minute = 0, second = 0;

		switch (format) {
			case "ISO_DATETIME":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				hour = parseInt(match[4], 10);
				minute = parseInt(match[5], 10);
				second = parseInt(match[6], 10);
				break;

			case "ISO_DATETIME_SHORT":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				hour = parseInt(match[4], 10);
				minute = parseInt(match[5], 10);
				break;

			case "YYYY-MM-DD":
			case "YYYY.MM.DD":
			case "YYYY/MM/DD":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				break;

			case "MM/DD/YYYY":
			case "M/D/YYYY":
				month = parseInt(match[1], 10);
				day = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
				break;

			case "DD-MM-YYYY":
			case "DD.MM.YYYY":
				day = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				year = parseInt(match[3], 10);
				break;

			case "YYYYMMDD":
				year = parseInt(match[1], 10);
				month = parseInt(match[2], 10);
				day = parseInt(match[3], 10);
				break;

			default:
				return null;
		}

		// Validate date components
		if (year >= 1900 && year <= 2100 && 
			month >= 1 && month <= 12 && 
			day >= 1 && day <= 31 &&
			hour >= 0 && hour <= 23 &&
			minute >= 0 && minute <= 59 &&
			second >= 0 && second <= 59) {
			
			const date = new Date(year, month - 1, day, hour, minute, second);
			
			// Verify the date is valid
			if (date.getFullYear() === year && 
				date.getMonth() === month - 1 && 
				date.getDate() === day) {
				return date;
			}
		}

		return null;
	}

	/**
	 * Validate if metadata date is reasonable
	 */
	private isValidMetadataDate(date: Date, propertyName?: string): boolean {
		const now = new Date();
		const fiveYearsAgo = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
		const twoYearsFromNow = new Date(now.getFullYear() + 2, now.getMonth(), now.getDate());

		// Most metadata dates should be within a reasonable range
		if (date < fiveYearsAgo || date > twoYearsFromNow) {
			// Allow wider range for certain property types
			if (propertyName && this.isArchivalProperty(propertyName)) {
				// Allow much older dates for archival properties
				const tenYearsAgo = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
				return date >= tenYearsAgo && date <= twoYearsFromNow;
			}
			return false;
		}

		return true;
	}

	/**
	 * Check if property name suggests archival/historical data
	 */
	private isArchivalProperty(propertyName: string): boolean {
		const archivalPatterns = [
			/creation/i,
			/created/i,
			/original/i,
			/archive/i,
			/historical/i,
			/legacy/i,
		];

		return archivalPatterns.some(pattern => pattern.test(propertyName));
	}

	/**
	 * Get cache statistics for debugging
	 */
	getCacheStats(): { size: number; maxSize: number; hitRate?: number } {
		return {
			size: this.fileDateCache.size,
			maxSize: this.MAX_CACHE_SIZE
		};
	}
}