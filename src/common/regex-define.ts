// Task identification
const TASK_REGEX = /^(([\s>]*)?(-|\d+\.|\*|\+)\s\[(.)\])\s*(.*)$/m;

// --- Emoji/Tasks Style Regexes ---
const EMOJI_START_DATE_REGEX = /🛫\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_COMPLETED_DATE_REGEX = /✅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_DUE_DATE_REGEX = /📅\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_SCHEDULED_DATE_REGEX = /⏳\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_CREATED_DATE_REGEX = /➕\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_CANCELLED_DATE_REGEX = /❌\s*(\d{4}-\d{2}-\d{2})/;
const EMOJI_ID_REGEX = /🆔\s*([^\s]+)/;
const EMOJI_DEPENDS_ON_REGEX = /⛔\s*([^\s]+)/;
const EMOJI_ON_COMPLETION_REGEX = /🏁\s*([^\s]+)/;
const EMOJI_RECURRENCE_REGEX =
	/🔁\s*(.*?)(?=\s(?:🗓️|🛫|⏳|✅|➕|❌|🆔|⛔|🏁|🔁|@|#)|$)/u;
const EMOJI_PRIORITY_REGEX = /(([🔺⏫🔼🔽⏬️⏬])|(\[#[A-E]\]))/u; // Using the corrected variant selector
const EMOJI_CONTEXT_REGEX = /@([\w-]+)/g;
const EMOJI_TAG_REGEX =
	/#[^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~\[\]\\\s]+/g; // Includes #project/ tags
const EMOJI_PROJECT_PREFIX = "#project/"; // Keep for backward compatibility

// Format types for prefix generation
export type MetadataFormat = "emoji" | "dataview";

// Function to get configurable project prefix based on format
export const getProjectPrefix = (
	prefix?: string,
	format: MetadataFormat = "emoji"
): string => {
	const projectPrefix = prefix || "project";
	if (format === "dataview") {
		return `[${projectPrefix}::`;
	} else {
		return `#${projectPrefix}/`;
	}
};

// Function to get configurable context prefix based on format
// Special handling: emoji format always uses @, dataview format uses configurable prefix
export const getContextPrefix = (
	prefix?: string,
	format: MetadataFormat = "emoji"
): string => {
	if (format === "dataview") {
		const contextPrefix = prefix || "context";
		return `[${contextPrefix}::`;
	} else {
		// For emoji format, always use @ (not configurable)
		return "@";
	}
};

// Function to get configurable area prefix based on format
export const getAreaPrefix = (
	prefix?: string,
	format: MetadataFormat = "emoji"
): string => {
	const areaPrefix = prefix || "area";
	if (format === "dataview") {
		return `[${areaPrefix}::`;
	} else {
		return `#${areaPrefix}/`;
	}
};

// Function to create dynamic regex for project tags
export const createProjectRegex = (prefix?: string): RegExp => {
	const projectPrefix = prefix || "project";
	return new RegExp(`#${projectPrefix}/([\\w-]+)`, "g");
};

// Function to create dynamic regex for dataview project fields
export const createDataviewProjectRegex = (prefix?: string): RegExp => {
	const projectPrefix = prefix || "project";
	return new RegExp(`\\[${projectPrefix}::\\s*([^\\]]+)\\]`, "i");
};

// Function to create dynamic regex for dataview context fields
export const createDataviewContextRegex = (prefix?: string): RegExp => {
	const contextPrefix = prefix || "context";
	return new RegExp(`\\[${contextPrefix}::\\s*([^\\]]+)\\]`, "i");
};

// --- Dataview Style Regexes ---
const DV_START_DATE_REGEX = /\[(?:start|🛫)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_COMPLETED_DATE_REGEX =
	/\[(?:completion|✅)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_DUE_DATE_REGEX = /\[(?:due|🗓️)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_SCHEDULED_DATE_REGEX = /\[(?:scheduled|⏳)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_CREATED_DATE_REGEX = /\[(?:created|➕)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_CANCELLED_DATE_REGEX = /\[(?:cancelled|❌)::\s*(\d{4}-\d{2}-\d{2})\]/i;
const DV_ID_REGEX = /\[(?:id|🆔)::\s*([^\]]+)\]/i;
const DV_DEPENDS_ON_REGEX = /\[(?:dependsOn|⛔)::\s*([^\]]+)\]/i;
const DV_ON_COMPLETION_REGEX = /\[(?:onCompletion|🏁)::\s*([^\]]+)\]/i;
const DV_RECURRENCE_REGEX = /\[(?:repeat|recurrence|🔁)::\s*([^\]]+)\]/i;
const DV_PRIORITY_REGEX = /\[priority::\s*([^\]]+)\]/i;
const DV_PROJECT_REGEX = /\[project::\s*([^\]]+)\]/i; // Default project regex
const DV_CONTEXT_REGEX = /\[context::\s*([^\]]+)\]/i; // Default context regex
// Dataview Tag Regex is the same, applied after DV field removal
const ANY_DATAVIEW_FIELD_REGEX = /\[\w+(?:|🗓️|✅|➕|🛫|⏳|🔁)::\s*[^\]]+\]/gi;

export {
	TASK_REGEX,
	EMOJI_START_DATE_REGEX,
	EMOJI_COMPLETED_DATE_REGEX,
	EMOJI_DUE_DATE_REGEX,
	EMOJI_SCHEDULED_DATE_REGEX,
	EMOJI_CREATED_DATE_REGEX,
	EMOJI_CANCELLED_DATE_REGEX,
	EMOJI_ID_REGEX,
	EMOJI_DEPENDS_ON_REGEX,
	EMOJI_ON_COMPLETION_REGEX,
	EMOJI_RECURRENCE_REGEX,
	EMOJI_PRIORITY_REGEX,
	EMOJI_CONTEXT_REGEX,
	EMOJI_TAG_REGEX,
	EMOJI_PROJECT_PREFIX,
	DV_START_DATE_REGEX,
	DV_COMPLETED_DATE_REGEX,
	DV_DUE_DATE_REGEX,
	DV_SCHEDULED_DATE_REGEX,
	DV_CREATED_DATE_REGEX,
	DV_CANCELLED_DATE_REGEX,
	DV_ID_REGEX,
	DV_DEPENDS_ON_REGEX,
	DV_ON_COMPLETION_REGEX,
	DV_RECURRENCE_REGEX,
	DV_PRIORITY_REGEX,
	DV_PROJECT_REGEX,
	DV_CONTEXT_REGEX,
	ANY_DATAVIEW_FIELD_REGEX,
};
