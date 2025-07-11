/**
 * Task parser configuration types and interfaces
 */

export enum MetadataParseMode {
	DataviewOnly = "dataview-only", // Only parse dataview format [key::value]
	EmojiOnly = "emoji-only", // Only parse emoji metadata
	Both = "both", // Parse both formats
	None = "none", // Don't parse metadata
}

export interface TaskParserConfig {
	parseMetadata: boolean;
	parseTags: boolean;
	parseComments: boolean;
	parseHeadings: boolean; // Whether to parse task headings
	maxIndentSize: number;
	maxParseIterations: number;
	maxMetadataIterations: number;
	maxTagLength: number;
	maxEmojiValueLength: number;
	maxStackOperations: number;
	maxStackSize: number;
	statusMapping: Record<string, string>; // Status name to character mapping, e.g. "InProgress" -> "/"
	emojiMapping: Record<string, string>; // Emoji to metadata key mapping, e.g. "📅" -> "due"
	metadataParseMode: MetadataParseMode; // Metadata parsing mode
	specialTagPrefixes: Record<string, string>; // Special tag prefix mapping, e.g. "project" -> "project"

	// Enhanced project configuration
	projectConfig?: {
		enableEnhancedProject: boolean;
		pathMappings: Array<{
			pathPattern: string;
			projectName: string;
			enabled: boolean;
		}>;
		metadataConfig: {
			metadataKey: string;
			inheritFromFrontmatter: boolean;
			inheritFromFrontmatterForSubtasks: boolean;
			enabled: boolean;
		};
		configFile: {
			fileName: string;
			searchRecursively: boolean;
			enabled: boolean;
		};
		metadataMappings: Array<{
			sourceKey: string;
			targetKey: string;
			enabled: boolean;
		}>;
		defaultProjectNaming: {
			strategy: "filename" | "foldername" | "metadata";
			metadataKey?: string;
			stripExtension?: boolean;
			enabled: boolean;
		};
	};
}

export interface EnhancedTask {
	id: string;
	content: string;
	status?: string; // Parsed status name based on mapping, null if no mapping
	rawStatus: string; // Original status character
	completed: boolean; // Keep for backward compatibility, based on 'x' or 'X'
	indentLevel: number;
	parentId?: string;
	childrenIds: string[];
	metadata: Record<string, string>;
	tags: string[];
	comment?: string;
	lineNumber: number; // 1-based line number
	actualIndent: number; // Actual indent spaces
	heading?: string; // Belonging markdown heading
	headingLevel?: number; // Heading level (1-6)
	listMarker: string; // Original task marker, like "-", "*", "+", "1.", "2.", etc.
	filePath: string;
	originalMarkdown: string;

	// Legacy fields for backward compatibility
	line: number;
	children: string[];
	priority?: number;
	startDate?: number;
	dueDate?: number;
	scheduledDate?: number;
	completedDate?: number;
	createdDate?: number;
	recurrence?: string;
	project?: string;
	context?: string;

	// Enhanced project information
	tgProject?: import("./task").TgProject;
}

export function createDefaultParserConfig(): TaskParserConfig {
	const emojiMapping: Record<string, string> = {
		// Basic date and time emojis
		"📅": "dueDate",
		"🗓️": "dueDate", // Alternative date emoji
		"⏰": "scheduledDate",
		"⏳": "scheduledDate", // Alternative scheduled time emoji
		"🛫": "startDate",
		"✅": "completedDate",
		"➕": "createdDate",
		"❌": "cancelledDate",

		// Task management emojis
		"🆔": "id",
		"⛔": "dependsOn",
		"🏁": "onCompletion",

		// Priority emojis (Tasks plugin style)
		"🔺": "priority", // highest
		"⏫": "priority", // high
		"🔼": "priority", // medium
		"🔽": "priority", // low
		"⏬️": "priority", // lowest (with variant selector)
		"⏬": "priority", // lowest (without variant selector)
		"📌": "priority", // Generic priority marker

		// Other common emojis
		"🔔": "reminder",
		"⭐": "starred",
		"❗": "important",
		"💡": "idea",
		"📍": "location",
		"🔁": "recurrence",

		// Status and marker emojis
		"🚀": "status",
		"⚡": "energy",
		"🎯": "goal",
		"💰": "cost",
		"⏱️": "duration",
		"👤": "assignee",
		"🏷️": "label",
	};

	const specialTagPrefixes: Record<string, string> = {
		// Default special tag prefixes, support i18n
		project: "project",
		area: "area",
		context: "context",
		tag: "tag",

		// Chinese support
		项目: "project",
		区域: "area",
		上下文: "context",
		标签: "tag",

		// Other language support examples
		projet: "project", // French
		proyecto: "project", // Spanish
		progetto: "project", // Italian
	};

	return {
		parseMetadata: true,
		parseTags: true,
		parseComments: true,
		parseHeadings: true,
		maxIndentSize: 8,
		maxParseIterations: 100000,
		maxMetadataIterations: 10000,
		maxTagLength: 100,
		maxEmojiValueLength: 200,
		maxStackOperations: 4000,
		maxStackSize: 1000,
		statusMapping: {},
		emojiMapping,
		metadataParseMode: MetadataParseMode.Both,
		specialTagPrefixes,
	};
}

export function createParserConfigWithStatusMapping(
	statusMapping: Record<string, string>
): TaskParserConfig {
	const config = createDefaultParserConfig();
	config.statusMapping = statusMapping;
	return config;
}
