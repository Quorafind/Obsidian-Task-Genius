// Mock for @codemirror/view

export class EditorView {
	state: any;

	constructor(config: any = {}) {
		this.state = config.state || null;
	}

	dispatch(transaction: any) {
		// Mock implementation
	}
}

export class WidgetType {
	eq(other: any): boolean {
		return false;
	}

	toDOM(): HTMLElement {
		return document.createElement("div");
	}

	ignoreEvent(event: Event): boolean {
		return false;
	}
}

export class ViewPlugin {
	static fromClass(cls: any, spec?: any) {
		return {
			extension: true,
			cls,
			spec,
		};
	}
}

export class ViewUpdate {
	docChanged: boolean = false;
	selectionSet: boolean = false;
	viewportChanged: boolean = false;
	view: EditorView;

	constructor(view: EditorView) {
		this.view = view;
	}
}

export class Decoration {
	static none = {
		size: 0,
		update: () => Decoration.none,
	};

	static widget(spec: any) {
		return {
			spec,
			range: (from: number, to: number) => ({ from, to, spec }),
		};
	}

	static replace(spec: any) {
		return {
			spec,
			range: (from: number, to: number) => ({ from, to, spec }),
		};
	}

	static set(decorations: any[]) {
		return {
			size: decorations.length,
			update: () => Decoration.none,
		};
	}
}

export class DecorationSet {
	static empty = Decoration.none;
	size: number = 0;

	update(spec: any) {
		return this;
	}
}

export class MatchDecorator {
	constructor(spec: any) {
		// Mock implementation
	}

	createDeco(view: EditorView) {
		return Decoration.none;
	}

	updateDeco(update: ViewUpdate, decorations: DecorationSet) {
		return decorations;
	}
}
