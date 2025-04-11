/**
 * Regular expressions for parsing task components
 */
export const TASK_REGEX = /^([\s>]*- \[(.)\])\s*(.*)$/m;
export const TAG_REGEX = /#[\w\/-]+/g;
export const CONTEXT_REGEX = /@[\w-]+/g;

/**
 * Task symbols and formatting
 */
export const DEFAULT_SYMBOLS = {
	prioritySymbols: {
		Highest: "🔺",
		High: "⏫",
		Medium: "🔼",
		Low: "🔽",
		Lowest: "⏬",
		None: "",
	},
	startDateSymbol: "🛫",
	createdDateSymbol: "➕",
	scheduledDateSymbol: "⏳",
	dueDateSymbol: "📅",
	doneDateSymbol: "✅",
	cancelledDateSymbol: "❌",
	recurrenceSymbol: "🔁",
	onCompletionSymbol: "🏁",
	dependsOnSymbol: "⛔",
	idSymbol: "🆔",
};
