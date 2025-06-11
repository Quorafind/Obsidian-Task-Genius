import { MetadataParseMode, TaskParserConfig } from "../types/TaskParserConfig";
import { MetadataFormat } from "../utils/taskUtil";
import type TaskProgressBarPlugin from "../index";

export const getConfig = (
	format: MetadataFormat,
	plugin?: TaskProgressBarPlugin
): TaskParserConfig => {
	// Get configurable prefixes from plugin settings, with fallback defaults
	const projectPrefix =
		plugin?.settings?.projectTagPrefix[format] || "project";
	const contextPrefix =
		plugin?.settings?.contextTagPrefix[format] ||
		(format === "dataview" ? "context" : "@");
	const areaPrefix = plugin?.settings?.areaTagPrefix[format] || "area";

	const config: TaskParserConfig = {
		// Basic parsing controls
		parseTags: true,
		parseMetadata: true,
		parseHeadings: false, // taskUtil functions are for single-line parsing
		parseComments: false, // Not needed for single-line parsing

		// Metadata format preference
		metadataParseMode:
			format === "dataview"
				? MetadataParseMode.DataviewOnly
				: MetadataParseMode.Both,

		// Status mapping (standard task states)
		statusMapping: {
			todo: " ",
			done: "x",
			cancelled: "-",
			forwarded: ">",
			scheduled: "<",
			important: "!",
			question: "?",
			incomplete: "/",
			paused: "p",
			pro: "P",
			con: "C",
			quote: "Q",
			note: "N",
			bookmark: "b",
			information: "i",
			savings: "S",
			idea: "I",
			location: "l",
			phone: "k",
			win: "w",
			key: "K",
		},

		// Emoji to metadata mapping
		emojiMapping: {
			"📅": "due",
			"🛫": "start_date",
			"⏳": "scheduled",
			"✅": "completed_date",
			"➕": "created_date",
			"🔁": "recurrence",
			"🔺": "priority",
			"⏫": "priority",
			"🔼": "priority",
			"🔽": "priority",
			"⏬": "priority",
		},

		// Special tag prefixes for project/context/area (now configurable)
		specialTagPrefixes: {
			[projectPrefix]: "project",
			[areaPrefix]: "area",
			[contextPrefix]: "context",
		},

		// Performance and parsing limits
		maxParseIterations: 1000,
		maxMetadataIterations: 100,
		maxTagLength: 100,
		maxEmojiValueLength: 200,
		maxStackOperations: 1000,
		maxStackSize: 100,
		maxIndentSize: 8,

		// Enhanced project configuration
		projectConfig: plugin?.settings?.projectConfig,
	};

	return config;
};
