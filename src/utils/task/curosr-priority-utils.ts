import { Editor } from "obsidian";
import { EditorView } from "@codemirror/view";
import { priorityChangeAnnotation } from "../../editor-extensions/ui-widgets/priority-picker";

function setPriorityAtCursor(editor: Editor, priority: string) {
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	const lineStart = editor.posToOffset({ line: cursor.line, ch: 0 });

	// Check if this line has a task
	const taskRegex =
		/^([\s|\t]*[-*+] \[.\].*?)(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])?(\s*)$/;
	const match = line.match(taskRegex);

	if (match) {
		// Find the priority position
		const priorityRegex = /(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])/;
		const priorityMatch = line.match(priorityRegex);

		// Replace any existing priority or add the new priority
		// @ts-ignore
		const cm = editor.cm as EditorView;
		if (priorityMatch) {
			// Replace existing priority
			cm.dispatch({
				changes: {
					from: lineStart + (priorityMatch.index || 0),
					to:
						lineStart +
						(priorityMatch.index || 0) +
						(priorityMatch[0]?.length || 0),
					insert: priority,
				},
				annotations: [priorityChangeAnnotation.of(true)],
			});
		} else {
			// Add new priority after task text
			const taskTextEnd = lineStart + match[1].length;
			cm.dispatch({
				changes: {
					from: taskTextEnd,
					to: taskTextEnd,
					insert: ` ${priority}`,
				},
				annotations: [priorityChangeAnnotation.of(true)],
			});
		}
	}
}

// Helper method to remove priority at cursor position
function removePriorityAtCursor(editor: Editor) {
	const cursor = editor.getCursor();
	const line = editor.getLine(cursor.line);
	const lineStart = editor.posToOffset({ line: cursor.line, ch: 0 });

	// Check if this line has a task with priority
	const priorityRegex = /(?:🔺|⏫|🔼|🔽|⏬️|\[#[A-C]\])/;
	const match = line.match(priorityRegex);

	if (match) {
		// Remove the priority
		// @ts-ignore
		const cm = editor.cm as EditorView;
		cm.dispatch({
			changes: {
				from: lineStart + (match.index || 0),
				to: lineStart + (match.index || 0) + (match[0]?.length || 0),
				insert: "",
			},
			annotations: [priorityChangeAnnotation.of(true)],
		});
	}
}

export { setPriorityAtCursor, removePriorityAtCursor };
