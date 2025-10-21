export interface FluentTaskViewState {
	currentWorkspace: string;
	selectedProject?: string | null;
	viewMode: "list" | "kanban" | "tree" | "calendar";
	viewModeByViewId?: Record<
		string,
		"list" | "kanban" | "tree" | "calendar"
	>;
	searchQuery?: string;
	filterInputValue?: string;
	filters?: any;
}

export type FluentTaskNavigationItem = {
	id: string;
	label: string;
	icon: string;
	type: "primary" | "project" | "other";
	action?: () => void;
	badge?: number;
};
