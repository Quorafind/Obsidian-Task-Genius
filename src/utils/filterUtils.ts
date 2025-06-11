import { Task } from "../types/task";
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
			return task.content
				.toLowerCase()
				.includes(node.value.toLowerCase());

		case "TAG":
			return task.metadata.tags.some(
				(tag) =>
					// Skip non-string tags
					typeof tag === "string" &&
					tag.toLowerCase() === node.value.toLowerCase()
			);

		case "PRIORITY":
			// Task priority is already a number (1-3, or potentially others if customized)
			const taskPriority = task.metadata.priority;

			// If task has no priority, it cannot match a priority filter
			if (taskPriority === undefined) return false;

			// Parse the filter priority value (emoji or #N format) into a number
			const filterPriorityValue = parsePriorityFilterValue(node.value);

			// If filter value is invalid, no match
			if (filterPriorityValue === null) return false;

			// Perform numerical comparison
			switch (node.op) {
				case ">":
					return taskPriority > filterPriorityValue;
				case "<":
					return taskPriority < filterPriorityValue;
				case "=":
					return taskPriority === filterPriorityValue;
				case ">=":
					return taskPriority >= filterPriorityValue;
				case "<=":
					return taskPriority <= filterPriorityValue;
				case "!=":
					return taskPriority !== filterPriorityValue;
				default:
					return false;
			}

		case "DATE":
			// Use dueDate (assuming it's the target, and a number/timestamp in ms)
			const taskDueDateTimestamp = task.metadata.dueDate;
			if (taskDueDateTimestamp === undefined) return false;

			try {
				// Compare using moment, assuming taskDueDate is a Unix timestamp (ms)
				const taskDate = moment(taskDueDateTimestamp);
				const filterDate = moment(node.value); // Assumes filter value is a parseable date string

				if (!taskDate.isValid() || !filterDate.isValid()) return false;

				switch (node.op) {
					case ">":
						return taskDate.isAfter(filterDate, "day"); // Compare day granularity
					case "<":
						return taskDate.isBefore(filterDate, "day");
					case "=":
						return taskDate.isSame(filterDate, "day");
					case ">=":
						// isSameOrAfter includes the start of the day
						return taskDate.isSameOrAfter(filterDate, "day");
					case "<=":
						// isSameOrBefore includes the end of the day
						return taskDate.isSameOrBefore(filterDate, "day");
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

// Helper function to convert emoji/text priorities to numerical values
// Returns null if the input is not a recognized priority format.
// Adjust the returned numbers based on your desired priority scale (higher number = higher priority assumed here).
export function parsePriorityFilterValue(value: string): number | null {
	const priorityMap: Record<string, number> = {
		// Emoji mapping (adjust numbers as needed)
		"🔺": 5, // Highest
		"⏫": 4, // High
		"🔼": 3, // Medium
		"🔽": 2, // Low
		"⏬️": 1, // Lowest
		"🔴": 4, // High
		"🟠": 3, // Medium
		"🟡": 2.5, // Medium-low (example)
		"🟢": 2, // Low
		"🔵": 1.5, // Low-lowest (example)
		"⚪️": 1, // Lowest
		"⚫️": 0, // Below lowest (example)
		highest: 5,
		high: 4,
		medium: 3,
		low: 2,
		lowest: 1,
		"[#A]": 5,
		"[#B]": 4,
		"[#C]": 3,
		"[#D]": 2,
		"[#E]": 1,
		// Text/Number mapping (e.g., #1, #2, #A)
		// Assuming higher number means higher priority if using digits directly
	};

	// Check direct emoji/text mapping first
	if (priorityMap.hasOwnProperty(value)) {
		return priorityMap[value];
	}

	// Check for #N format (e.g., #1, #2, #3)
	if (value.startsWith("#")) {
		const numStr = value.substring(1);
		const num = parseInt(numStr, 10);
		if (!isNaN(num)) {
			// You might want to invert this if lower number means higher priority in #N format
			return num;
		}
		// Handle potential #A, #B etc. if needed, map them to numbers
		// Example: if (numStr === 'A') return 5;
	}

	// Try parsing as a plain number
	const num = parseInt(value, 10);
	if (!isNaN(num)) {
		return num;
	}

	console.warn(`Unrecognized priority filter value: ${value}`);
	return null; // Not a recognized format
}
