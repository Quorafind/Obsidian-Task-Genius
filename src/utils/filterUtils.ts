import { Task } from "../editor-ext/filterTasks";
import { moment } from "obsidian";

// Types for parsing expression trees in advanced filtering
export type FilterNode =
	| { type: "AND"; left: FilterNode; right: FilterNode }
	| { type: "OR"; left: FilterNode; right: FilterNode }
	| { type: "NOT"; child: FilterNode }
	| { type: "TEXT"; value: string }
	| { type: "TAG"; value: string }
	| {
			type: "PRIORITY";
			op: ">" | "<" | "=" | ">=" | "<=" | "!=";
			value: string;
	  }
	| { type: "DATE"; op: ">" | "<" | "=" | ">=" | "<=" | "!="; value: string };

// Parse the advanced filter query into a tree of filter nodes
export function parseAdvancedFilterQuery(query: string): FilterNode {
	// Tokenize and parse the query into a filter tree
	// This is a simple implementation that handles basic boolean operations

	query = query.trim();

	// Base case: empty query
	if (!query) {
		return { type: "TEXT", value: "" };
	}

	// Handle parentheses groups first
	let parenthesesLevel = 0;
	let openParenIndex = -1;

	for (let i = 0; i < query.length; i++) {
		if (query[i] === "(") {
			if (parenthesesLevel === 0) {
				openParenIndex = i;
			}
			parenthesesLevel++;
		} else if (query[i] === ")") {
			parenthesesLevel--;
			if (parenthesesLevel === 0 && openParenIndex !== -1) {
				// Found a complete parenthesized expression
				const beforeParen = query.substring(0, openParenIndex).trim();
				const inParens = query.substring(openParenIndex + 1, i).trim();
				const afterParen = query.substring(i + 1).trim();

				// Check if the parenthesized expression is negated
				if (beforeParen.toUpperCase().endsWith("NOT")) {
					const beforeNot = beforeParen
						.substring(0, beforeParen.length - 3)
						.trim();
					const notNode: FilterNode = {
						type: "NOT",
						child: parseAdvancedFilterQuery(inParens),
					};

					// Combine with the rest of the query
					if (beforeNot || afterParen) {
						const restQuery = (beforeNot + " " + afterParen).trim();
						return makeCompoundNode(
							notNode,
							parseAdvancedFilterQuery(restQuery)
						);
					}
					return notNode;
				}
				// Non-negated parenthesized expression
				else {
					const parenNode = parseAdvancedFilterQuery(inParens);

					// Combine with the rest of the query
					if (beforeParen || afterParen) {
						const restQuery = (
							beforeParen +
							" " +
							afterParen
						).trim();
						return makeCompoundNode(
							parenNode,
							parseAdvancedFilterQuery(restQuery)
						);
					}
					return parenNode;
				}
			}
		}
	}

	// Handle NOT operator (without parentheses)
	if (query.toUpperCase().startsWith("NOT ")) {
		return {
			type: "NOT",
			child: parseAdvancedFilterQuery(query.substring(4).trim()),
		};
	}

	// Handle binary operators (AND, OR)
	// Find the first AND or OR at the top level
	const andIndex = findTopLevelOperator(query, " AND ");
	if (andIndex !== -1) {
		return {
			type: "AND",
			left: parseAdvancedFilterQuery(query.substring(0, andIndex).trim()),
			right: parseAdvancedFilterQuery(
				query.substring(andIndex + 5).trim()
			),
		};
	}

	const orIndex = findTopLevelOperator(query, " OR ");
	if (orIndex !== -1) {
		return {
			type: "OR",
			left: parseAdvancedFilterQuery(query.substring(0, orIndex).trim()),
			right: parseAdvancedFilterQuery(
				query.substring(orIndex + 4).trim()
			),
		};
	}

	// Handle special filter types
	if (query.startsWith("#")) {
		return { type: "TAG", value: query };
	}

	// Handle priority filters
	if (query.toUpperCase().startsWith("PRIORITY:")) {
		const restQuery = query.substring(9).trim();

		// Check for extended operators
		if (restQuery.startsWith(">=")) {
			return {
				type: "PRIORITY",
				op: ">=",
				value: query.substring(11).trim(),
			};
		} else if (restQuery.startsWith("<=")) {
			return {
				type: "PRIORITY",
				op: "<=",
				value: query.substring(11).trim(),
			};
		} else if (restQuery.startsWith("!=")) {
			return {
				type: "PRIORITY",
				op: "!=",
				value: query.substring(11).trim(),
			};
		} else if (
			restQuery.startsWith(">") ||
			restQuery.startsWith("<") ||
			restQuery.startsWith("=")
		) {
			// Existing operators
			const op = restQuery.charAt(0);
			return {
				type: "PRIORITY",
				op: op as ">" | "<" | "=",
				value: restQuery.substring(1).trim(),
			};
		} else {
			// No operator - exact match
			return {
				type: "PRIORITY",
				op: "=",
				value: restQuery.trim(),
			};
		}
	}

	// Handle date filters
	if (query.toUpperCase().startsWith("DATE:")) {
		const restQuery = query.substring(5).trim();

		// Check for extended operators
		if (restQuery.startsWith(">=")) {
			return {
				type: "DATE",
				op: ">=",
				value: query.substring(7).trim(),
			};
		} else if (restQuery.startsWith("<=")) {
			return {
				type: "DATE",
				op: "<=",
				value: query.substring(7).trim(),
			};
		} else if (restQuery.startsWith("!=")) {
			return {
				type: "DATE",
				op: "!=",
				value: query.substring(7).trim(),
			};
		} else if (
			restQuery.startsWith(">") ||
			restQuery.startsWith("<") ||
			restQuery.startsWith("=")
		) {
			// Existing operators
			const op = restQuery.charAt(0);
			return {
				type: "DATE",
				op: op as ">" | "<" | "=",
				value: restQuery.substring(1).trim(),
			};
		} else {
			// No operator - exact match
			return {
				type: "DATE",
				op: "=",
				value: restQuery.trim(),
			};
		}
	}

	// Default: plain text filter
	return { type: "TEXT", value: query };
}

// Helper to find top-level operators in the query string
function findTopLevelOperator(query: string, operator: string): number {
	let parenthesesLevel = 0;

	for (let i = 0; i <= query.length - operator.length; i++) {
		if (query[i] === "(") {
			parenthesesLevel++;
		} else if (query[i] === ")") {
			parenthesesLevel--;
		} else if (
			parenthesesLevel === 0 &&
			query.substring(i, i + operator.length).toUpperCase() === operator
		) {
			return i;
		}
	}

	return -1;
}

// Helper to combine two filter nodes into a compound AND node
function makeCompoundNode(nodeA: FilterNode, nodeB: FilterNode): FilterNode {
	return {
		type: "AND",
		left: nodeA,
		right: nodeB,
	};
}

// Evaluate a filter node against a task
export function evaluateFilterNode(node: FilterNode, task: Task): boolean {
	switch (node.type) {
		case "AND":
			return (
				evaluateFilterNode(node.left, task) &&
				evaluateFilterNode(node.right, task)
			);

		case "OR":
			return (
				evaluateFilterNode(node.left, task) ||
				evaluateFilterNode(node.right, task)
			);

		case "NOT":
			return !evaluateFilterNode(node.child, task);

		case "TEXT":
			return task.text.toLowerCase().includes(node.value.toLowerCase());

		case "TAG":
			return task.tags.some(
				(tag) => tag.toLowerCase() === node.value.toLowerCase()
			);

		case "PRIORITY":
			if (!task.priority) return false;

			// Extract the priority level for comparison
			const taskPriority = task.priority.includes("#")
				? task.priority.replace(/[^\w]/g, "") // Extract letter from #A format
				: getPriorityValueFromEmoji(task.priority); // Convert emoji to value

			const filterPriority = node.value.includes("#")
				? node.value.replace(/[^\w]/g, "") // Extract letter from #A format
				: getPriorityValueFromEmoji(node.value); // Convert emoji to value

			if (!taskPriority || !filterPriority) return false;

			switch (node.op) {
				case ">":
					return taskPriority < filterPriority; // Reversed because A > B in priority
				case "<":
					return taskPriority > filterPriority; // Reversed because A < B in priority
				case "=":
					return taskPriority === filterPriority;
				case ">=":
					return taskPriority <= filterPriority; // Reversed for the same reason
				case "<=":
					return taskPriority >= filterPriority; // Reversed for the same reason
				case "!=":
					return taskPriority !== filterPriority;
				default:
					return false;
			}

		case "DATE":
			if (!task.date) return false;

			try {
				const taskDate = moment(task.date);
				const filterDate = moment(node.value);

				if (!taskDate.isValid() || !filterDate.isValid()) return false;

				switch (node.op) {
					case ">":
						return taskDate.isAfter(filterDate);
					case "<":
						return taskDate.isBefore(filterDate);
					case "=":
						return taskDate.isSame(filterDate, "day");
					case ">=":
						return (
							taskDate.isAfter(filterDate) ||
							taskDate.isSame(filterDate, "day")
						);
					case "<=":
						return (
							taskDate.isBefore(filterDate) ||
							taskDate.isSame(filterDate, "day")
						);
					case "!=":
						return !taskDate.isSame(filterDate, "day");
					default:
						return false;
				}
			} catch (error) {
				console.error("Date comparison error:", error);
				return false;
			}
	}
}

// Helper function to convert emoji priorities to letter values with correct ordering
function getPriorityValueFromEmoji(emoji: string): string {
	switch (emoji) {
		// TASK_PRIORITIES from priorityPicker.ts (highest to lowest)
		case "🔺":
			return "A+"; // Highest
		case "⏫":
			return "A"; // High
		case "🔼":
			return "B"; // Medium
		case "🔽":
			return "D"; // Low
		case "⏬️":
			return "E"; // Lowest

		// Color-based priorities (additional commonly used emojis)
		case "🔴":
			return "A"; // High (same as ⏫)
		case "🟠":
			return "B"; // Medium (same as 🔼)
		case "🟡":
			return "C"; // Medium-low
		case "🟢":
			return "D"; // Low (same as 🔽)
		case "🔵":
			return "D-"; // Low-lowest
		case "⚪️":
			return "E"; // Lowest (same as ⏬️)
		case "⚫️":
			return "F"; // Below lowest
		default:
			return "";
	}
}
