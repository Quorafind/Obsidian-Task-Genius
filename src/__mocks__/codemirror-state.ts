// Mock for @codemirror/state

export class Text {
	content: string;

	constructor(content: string = "") {
		this.content = content;
	}

	toString() {
		return this.content;
	}

	get length() {
		return this.content.length;
	}

	sliceString(from: number, to: number) {
		return this.content.slice(from, to);
	}

	line(lineNum: number) {
		const lines = this.content.split("\n");
		if (lineNum < 1 || lineNum > lines.length) {
			throw new Error(`Line ${lineNum} out of range`);
		}

		const line = lines[lineNum - 1];
		let from = 0;
		for (let i = 0; i < lineNum - 1; i++) {
			from += lines[i].length + 1; // +1 for newline
		}

		return {
			text: line,
			from,
			to: from + line.length,
			number: lineNum,
		};
	}

	get lines() {
		return this.content.split("\n").length;
	}

	lineAt(pos: number) {
		let lineStart = 0;
		let lineEnd = 0;
		let lineNumber = 1;

		const lines = this.content.split("\n");
		for (const line of lines) {
			lineEnd = lineStart + line.length;

			if (pos >= lineStart && pos <= lineEnd) {
				return {
					text: line,
					from: lineStart,
					to: lineEnd,
					number: lineNumber,
				};
			}

			lineStart = lineEnd + 1; // +1 for newline
			lineNumber++;
		}

		// Default to last line if position is beyond content
		return {
			text: lines[lines.length - 1] || "",
			from: lineStart - (lines[lines.length - 1]?.length || 0) - 1,
			to: lineStart,
			number: lines.length,
		};
	}
}

export class Changes {
	_changes: Array<{
		fromA: number;
		toA: number;
		fromB: number;
		toB: number;
		inserted: Text;
	}>;

	constructor() {
		this._changes = [];
	}

	get length() {
		return this._changes.length;
	}

	iterChanges(
		f: (
			fromA: number,
			toA: number,
			fromB: number,
			toB: number,
			inserted: Text
		) => void
	) {
		for (const change of this._changes) {
			f(
				change.fromA,
				change.toA,
				change.fromB,
				change.toB,
				change.inserted
			);
		}
	}
}

export class Transaction {
	startState: EditorState;
	newDoc: Text;
	changes: Changes;
	selection: any;
	annotations: Map<Annotation<any>, any>;

	constructor(
		options: {
			startState?: EditorState;
			newDoc?: Text;
			changes?: Changes;
			selection?: any;
			annotations?: Map<Annotation<any>, any>;
		} = {}
	) {
		this.startState = options.startState || new EditorState();
		this.newDoc = options.newDoc || new Text();
		this.changes = options.changes || new Changes();
		this.selection = options.selection || null;
		this.annotations = options.annotations || new Map();
	}

	annotation(annotation: Annotation<any>) {
		return this.annotations.get(annotation);
	}

	get docChanged() {
		return this.changes.length > 0;
	}

	isUserEvent(type: string) {
		return false;
	}
}

export class EditorState {
	doc: Text;
	selection: any;
	_fields: Map<any, any>;

	constructor(
		config: { doc?: Text; selection?: any; extensions?: any[] } = {}
	) {
		this.doc = config.doc || new Text();
		this.selection = config.selection || null;
		this._fields = new Map();

		if (config.extensions) {
			config.extensions.forEach((ext) => {
				if (ext && ext.hasOwnProperty("provides")) {
					const fieldProvider = ext.provides;
					if (
						fieldProvider &&
						fieldProvider.field &&
						fieldProvider.create
					) {
						this._fields.set(
							fieldProvider.field,
							fieldProvider.create(this)
						);
					}
				} else if (
					ext &&
					ext.hasOwnProperty("field") &&
					ext.hasOwnProperty("create")
				) {
					this._fields.set(ext.field, ext.create(this));
				}
			});
		}
	}

	update(spec: any = {}) {
		const changesSpec = spec.changes || {};
		const from = changesSpec.from ?? 0;
		const to = changesSpec.to ?? from;
		const insert =
			typeof changesSpec.insert === "string"
				? changesSpec.insert
				: changesSpec.insert?.toString?.() ?? "";

		const oldText = this.doc.toString();
		const newContent = oldText.slice(0, from) + insert + oldText.slice(to);
		const newDoc = new Text(newContent);

		const changes = new Changes();
		(changes as any)._changes.push({
			fromA: from,
			toA: to,
			fromB: from,
			toB: from + insert.length,
			inserted: new Text(insert),
		});

		return new Transaction({
			startState: this,
			newDoc,
			changes,
			selection: spec.selection,
			annotations: spec.annotations,
		});
	}

	field<T>(field: any /* StateField<T> | Facet<any, T> */): T | undefined {
		return this._fields.get(field);
	}

	static create(config: any = {}) {
		return new EditorState(config);
	}

	static transactionFilter = {
		of: (f: (tr: Transaction) => TransactionSpec) => {
			return {
				filter: f,
			};
		},
	};

	// Add transactionExtender mock for tests
	static transactionExtender = {
		of: (
			f: (
				tr: Transaction
			) => TransactionSpec | readonly TransactionSpec[] | null
		) => {
			return {
				extend: f,
			};
		},
	};
}

export class Annotation<T> {
	constructor(public name: string) {}

	of(value: T) {
		return value;
	}

	static define<T>() {
		return new Annotation<T>("mock-annotation");
	}
}

export interface TransactionSpec {
	changes?: any;
	selection?: any;
	annotations?: any;
}

export const StateEffect = {
	define: () => ({
		of: (value: any) => ({ value }),
	}),
};

// Add a mock for EditorSelection
export const EditorSelection = {
	single: jest.fn((anchor: number, head?: number) => {
		// Return a mock SelectionRange or similar structure
		// The specific structure depends on what properties your tests need
		const resolvedHead = head ?? anchor;
		return {
			anchor: anchor,
			head: resolvedHead,
			from: Math.min(anchor, resolvedHead),
			to: Math.max(anchor, resolvedHead),
			empty: anchor === resolvedHead,
			// You might need to add other properties based on actual usage:
			// main: { anchor, head: resolvedHead }, // Mock main selection range
			// ranges: [{ anchor, head: resolvedHead }], // Mock ranges array
			// ... other methods or properties EditorSelection/SelectionRange might need
		};
	}),
	// If your code also uses other static methods or properties of EditorSelection,
	// such as EditorSelection.range(), add corresponding mocks here as well
	// range: jest.fn((anchor: number, head: number) => { ... }),
};
