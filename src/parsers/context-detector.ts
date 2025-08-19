/**
 * Context Detector for Tag Parsing
 *
 * This utility class provides context-aware detection of protected regions
 * where hash symbols (#) should not be interpreted as tag markers.
 *
 * Protected contexts include:
 * - Links (Obsidian [[...]], Markdown [...](url), direct URLs)
 * - Color codes (#RGB, #RRGGBB)
 * - Inline code (`code`)
 * - Other special contexts
 */

/**
 * Represents a protected range in the content where tag parsing should be skipped
 */
export interface ProtectedRange {
	/** Start position (inclusive) */
	start: number;
	/** End position (exclusive) */
	end: number;
	/** Type of protection for debugging/logging */
	type:
		| "obsidian-link"
		| "markdown-link"
		| "url"
		| "color-code"
		| "inline-code"
		| "other";
	/** Original matched content for debugging */
	content?: string;
}

/**
 * Context detector for identifying protected regions in markdown content
 */
export class ContextDetector {
	private content: string;
	private protectedRanges: ProtectedRange[] = [];

	constructor(content: string) {
		this.content = content;
		this.protectedRanges = [];
	}

	/**
	 * Detect all protected ranges in the content
	 * @returns Array of protected ranges sorted by start position
	 */
	public detectAllProtectedRanges(): ProtectedRange[] {
		this.protectedRanges = [];

		// Detect different types of protected content
		// Order matters: more specific patterns should be detected first
		this.detectObsidianLinks();
		this.detectMarkdownLinks();
		this.detectInlineCode();
		this.detectDirectUrls(); // After markdown links to avoid conflicts
		this.detectColorCodes();

		// Merge overlapping ranges and sort
		return this.mergeAndSortRanges();
	}

	/**
	 * Check if a position is within any protected range
	 * @param position Position to check
	 * @returns True if position is protected
	 */
	public isPositionProtected(position: number): boolean {
		return this.protectedRanges.some(
			(range) => position >= range.start && position < range.end
		);
	}

	/**
	 * Find the next unprotected hash symbol starting from a given position
	 * @param startPos Starting position to search from
	 * @returns Position of next unprotected hash, or -1 if none found
	 */
	public findNextUnprotectedHash(startPos: number = 0): number {
		let pos = startPos;
		while (pos < this.content.length) {
			const hashPos = this.content.indexOf("#", pos);
			if (hashPos === -1) {
				return -1; // No more hash symbols found
			}

			if (!this.isPositionProtected(hashPos)) {
				return hashPos; // Found unprotected hash
			}

			pos = hashPos + 1; // Continue searching after this hash
		}
		return -1;
	}

	/**
	 * Detect Obsidian-style links [[...]]
	 */
	private detectObsidianLinks(): void {
		const regex = /\[\[([^\]]+)\]\]/g;
		let match;

		while ((match = regex.exec(this.content)) !== null) {
			this.protectedRanges.push({
				start: match.index,
				end: match.index + match[0].length,
				type: "obsidian-link",
				content: match[0],
			});
		}
	}

	/**
	 * Detect Markdown-style links [text](url)
	 */
	private detectMarkdownLinks(): void {
		// Match [text](url) format, handling nested brackets and parentheses
		const regex = /\[([^\]]*)\]\(([^)]+)\)/g;
		let match;

		while ((match = regex.exec(this.content)) !== null) {
			this.protectedRanges.push({
				start: match.index,
				end: match.index + match[0].length,
				type: "markdown-link",
				content: match[0],
			});
		}
	}

	/**
	 * Detect direct URLs (http, https, ftp, mailto, etc.)
	 */
	private detectDirectUrls(): void {
		// Match common URL schemes
		const urlRegex = /(?:https?|ftp|mailto|file):\/\/[^\s<>"{}|\\^`\[\]]+/g;
		let match;

		while ((match = urlRegex.exec(this.content)) !== null) {
			this.protectedRanges.push({
				start: match.index,
				end: match.index + match[0].length,
				type: "url",
				content: match[0],
			});
		}
	}

	/**
	 * Detect CSS color codes (#RGB, #RRGGBB)
	 */
	private detectColorCodes(): void {
		// Match 3 or 6 digit hex color codes
		const colorRegex = /#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})(?![0-9A-Fa-f])/g;
		let match;

		while ((match = colorRegex.exec(this.content)) !== null) {
			// Additional validation: check if it's likely a color code
			if (this.isLikelyColorCode(match.index, match[0])) {
				this.protectedRanges.push({
					start: match.index,
					end: match.index + match[0].length,
					type: "color-code",
					content: match[0],
				});
			}
		}
	}

	/**
	 * Detect inline code blocks (`code`)
	 */
	private detectInlineCode(): void {
		// Handle single and multiple backticks
		const codeRegex = /(`+)([^`]|[^`].*?[^`])\1(?!`)/g;
		let match;

		while ((match = codeRegex.exec(this.content)) !== null) {
			this.protectedRanges.push({
				start: match.index,
				end: match.index + match[0].length,
				type: "inline-code",
				content: match[0],
			});
		}
	}

	/**
	 * Check if a hash symbol is likely a color code based on context
	 */
	private isLikelyColorCode(position: number, colorCode: string): boolean {
		// Check preceding character - color codes are usually preceded by whitespace,
		// CSS property syntax, or other non-alphanumeric characters
		const prevChar = position > 0 ? this.content[position - 1] : " ";
		const nextPos = position + colorCode.length;
		const nextChar =
			nextPos < this.content.length ? this.content[nextPos] : " ";

		// Color codes are typically:
		// 1. At word boundaries
		// 2. In CSS-like contexts
		// 3. Not followed by alphanumeric characters (already handled by regex)
		const isWordBoundary = /\s|^|[^a-zA-Z0-9]/.test(prevChar);
		const isValidTermination = /\s|$|[^a-zA-Z0-9]/.test(nextChar);

		return isWordBoundary && isValidTermination;
	}

	/**
	 * Merge overlapping ranges and sort by start position
	 */
	private mergeAndSortRanges(): ProtectedRange[] {
		if (this.protectedRanges.length === 0) {
			return [];
		}

		// Sort by start position
		this.protectedRanges.sort((a, b) => a.start - b.start);

		const merged: ProtectedRange[] = [];
		let current = this.protectedRanges[0];

		for (let i = 1; i < this.protectedRanges.length; i++) {
			const next = this.protectedRanges[i];

			if (current.end > next.start) {
				// Truly overlapping ranges - merge them
				// Prefer the more specific type (first detected)
				current = {
					start: current.start,
					end: Math.max(current.end, next.end),
					type: current.type, // Keep the first (more specific) type
					content: this.content.substring(
						current.start,
						Math.max(current.end, next.end)
					),
				};
			} else {
				// Non-overlapping - add current and move to next
				merged.push(current);
				current = next;
			}
		}

		// Add the last range
		merged.push(current);

		this.protectedRanges = merged;
		return merged;
	}

	/**
	 * Get debug information about detected ranges
	 */
	public getDebugInfo(): string {
		const ranges = this.detectAllProtectedRanges();
		return ranges
			.map(
				(range) =>
					`${range.type}: [${range.start}-${range.end}] "${range.content}"`
			)
			.join("\n");
	}
}
