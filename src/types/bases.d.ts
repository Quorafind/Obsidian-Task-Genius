import { App } from "obsidian";

/**
 * Sort direction enum
 */
type SortDirection = "ASC" | "DESC" | "TOGGLE" | "NONE";

/**
 * Property type enum
 */
type PropertyType = "property" | "file" | "formula";

/**
 * Data type enum for properties
 */
type PropertyDataType =
	| "text"
	| "number"
	| "date"
	| "boolean"
	| "list"
	| "object";

interface BasesLocalization {
	/**
	 * Returns the plugin name
	 */
	name(): string;

	/**
	 * Returns the plugin description
	 */
	desc(): string;

	/**
	 * Returns the command text for creating a new base file
	 */
	commandCreateNew(): string;

	/**
	 * Returns the command text for inserting a new base
	 */
	commandInsertNew(): string;

	/**
	 * Returns the command text for copying table
	 */
	commandCopyTable(): string;

	/**
	 * Returns the command text for changing view
	 */
	commandChangeView(): string;

	/**
	 * Returns the action text for creating a new base
	 */
	actionNewBase(): string;

	/**
	 * Returns error message for view registration failure
	 * @param options - Contains viewID that failed to register
	 */
	msgErrorRegisterView(options: { viewID: string }): string;

	/**
	 * Table view localization
	 */
	table: {
		name(): string;
	};

	/**
	 * Cards view localization
	 */
	cards: {
		name(): string;
	};
}

/**
 * Extended plugin interface that includes bases
 */
interface BasePlugins {
	bases: BasesLocalization;
	// Other plugins can be added here as discovered
	commandPalette?: {
		instructionNavigate(): string;
		instructionUse(): string;
		instructionDismiss(): string;
	};
	editorStatus?: {
		name(): string;
		desc(): string;
		read(): string;
		editSource(): string;
		editLivePreview(): string;
	};
}

/**
 * Global BasePlugin interface
 */
interface BasePlugin {
	plugins: BasePlugins;
	setting?: {
		appearance?: {
			labelCurrentlyActive(): string;
		};
	};
}

// View related types
interface BasesViewSettings {
	get(key: string): any;
	set(data: any): void;
	getOrder(): string[] | null;
	setOrder(order: string[]): void;
	getDisplayName(prop: any): string;
	setDisplayName(prop: any, name: string): void;
	getViewName(): string;
}

interface BasesViewData {
	entries: BasesEntry[];
}

interface BasesEntry {
	/** Context object with app instance and filter */
	ctx: {
		_local: any;
		app: App;
		filter: any;
		formulas: any;
		localUsed: boolean;
	};
	/** File object */
	file: {
		parent: any;
		deleted: boolean;
		vault: any;
		path: string;
		name: string;
		extension: string;
		getShortName(): string;
	};
	/** Formula definitions */
	formulas: Record<string, any>;
	/** Implicit file properties */
	implicit: {
		file: any;
		name: string;
		path: string;
		folder: string;
		ext: string;
	};
	/** Lazy evaluation cache for computed values */
	lazyEvalCache: Record<string, any>;
	/** File properties from frontmatter */
	properties: Record<string, any>;

	/** Get value for a property */
	getValue(prop: {
		type: "property" | "file" | "formula";
		name: string;
	}): any;
	/** Update a property value */
	updateProperty(key: string, value: any): void;
	/** Get formula value */
	getFormulaValue(formula: string): any;
	/** Get all property keys */
	getPropertyKeys(): string[];
}

interface BasesProperty {
	name: string;
	type: PropertyType;
	dataType?: PropertyDataType;
}

/**
 * Base view interface that all view types inherit from
 */
interface BaseView {
	/**
	 * Called when the view is loaded
	 */
	onload?(): void;

	/**
	 * Called when the view is unloaded
	 */
	onunload?(): void;

	/**
	 * Returns the actions menu items for this view
	 */
	onActionsMenu(): Array<{
		name: string;
		callback: () => void;
		icon: string;
	}>;

	/**
	 * Returns the edit menu items for this view
	 */
	onEditMenu(): Array<{
		displayName: string;
		component: (container: HTMLElement) => any;
	}>;

	/**
	 * Called when the view is resized
	 */
	onResize(): void;
}

/**
 * Generic view type that can be extended for different view implementations
 */
interface BasesView extends BaseView {
	type: string;
	app: App;
	containerEl: HTMLElement;
	settings: BasesViewSettings;
	data: BasesViewData[];
	properties: BasesProperty[];

	// Core methods
	updateConfig(settings: BasesViewSettings): void;
	updateData(properties: BasesProperty[], data: BasesViewData[]): void;
	display(): void;
}

// Function related types
interface BasesFunction {
	name: string;
	returnType?: string;
	args?: Array<{
		name: string;
		type: string | string[];
		optional?: boolean;
	}>;
	isOperator?: boolean;

	apply(arg1: any, arg2?: any): any;
	getDisplayName?(type: string): string;
	getRHSWidgetType?(type: string): string;
	serialize?(arg1: string, arg2?: string): string;
}

interface BasesOperatorFunction extends BasesFunction {
	isOperator: true;
}

// View factory function type
type BasesViewFactory = (container: HTMLElement) => BaseView;

/**
 * View registration configuration
 */
interface BasesViewRegistration {
	name: string;
	icon: string;
	factory: BasesViewFactory;
	getSettings?: () => any;
}

/**
 * Operator function configuration
 */
interface OperatorFuncConfig {
	funcName: string;
	display: string;
	inverseDisplay: string;
}

// Plugin interface extension
interface BasesPlugin {
	id: string;
	name: string;
	description: string;
	defaultOn: boolean;
	app: App;
	handlers: Record<string, BasesViewFactory>;
	functions: Record<string, BasesFunction>;
	registrations: Record<string, BasesViewRegistration>;

	// Methods
	init(app: App, plugin: any): void;
	onEnable(app: App, plugin: any): void;
	registerView(viewId: string, factory: BasesViewFactory): void;
	registerView(viewId: string, config: BasesViewRegistration): void;
	deregisterView(viewId: string): void;
	getViewTypes(): string[];
	getViewFactory(viewId: string): BasesViewFactory | null;
	getRegistration(viewId: string): BasesViewRegistration | null;
	getRegistrations(): Record<string, BasesViewRegistration>;
	registerFunction(func: BasesFunction): void;
	deregisterFunction(name: string): void;
	getFunction(name: string): BasesFunction | null;
	getOperatorFunctions(): BasesOperatorFunction[];
	createAndEmbedBase(editor: any): Promise<void>;
	createNewBasesFile(
		parent: any,
		name?: string,
		template?: string
	): Promise<any>;
	onFileMenu(menu: any, file: any, source: string, trigger?: any): void;
}

// Declare global variable
declare const BasePlugin: BasePlugin;
