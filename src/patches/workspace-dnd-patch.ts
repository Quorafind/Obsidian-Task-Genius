import type TaskProgressBarPlugin from "@/index";
import { around, dedupe } from "monkey-around";
import { Workspace } from "obsidian";

// Use WeakMap to avoid attaching arbitrary properties to Workspace instances
const RESTRICT_DND_STATE: WeakMap<any, boolean> = new WeakMap();
const setRestrictState = (ws: any, val: boolean) => {
	if (ws) RESTRICT_DND_STATE.set(ws, !!val);
};
const getRestrictState = (ws: any): boolean => {
	return !!(ws && RESTRICT_DND_STATE.get(ws));
};

/** View types that should never be drag-moved to the center panel. */
const RESTRICTED_VIEW_TYPES = new Set<string>([
	"tg-left-sidebar",
	"tg-right-detail",
	"tg-timeline-sidebar-view",
]);

/** Allow other modules to add more restricted view types at runtime. */
export function registerRestrictedDnDViewTypes(...types: string[]) {
	for (const t of types) if (t) RESTRICTED_VIEW_TYPES.add(t);
}

function isRestrictedLeaf(leaf: any): boolean {
	try {
		const vt = leaf?.view?.getViewType?.();
		return typeof vt === "string" && RESTRICTED_VIEW_TYPES.has(vt);
	} catch {
		return false;
	}
}

/** Unique keys for deduping patches across plugins */
const KEY_ON_DRAG = "task-genius/workspace-dnd:onDragLeaf";
const KEY_GET_DROP = "task-genius/workspace-dnd:getDropLocation";

/**
 * Install a runtime monkey-patch for Obsidian's internal drag handling,
 * using monkey-around for co-operative, removable patches.
 */
export function installWorkspaceDragMonitor(
	plugin: TaskProgressBarPlugin,
): void {
	const unpatch = around(Workspace.prototype as any, {
		onDragLeaf(old: Function | undefined) {
			return dedupe(
				KEY_ON_DRAG,
				old as Function,
				function (this: any, e: DragEvent, leaf: any) {
					const restricted = isRestrictedLeaf(leaf);
					// Mark workspace as currently dragging a restricted leaf until drop/dragend
					if (restricted) setRestrictState(this, true);
					if (restricted) {
						const vt = leaf?.view?.getViewType?.();
						console.debug(
							"[Task Genius] onDragLeaf(restricted)",
							vt,
						);
					} else {
						console.debug("[Task Genius] onDragLeaf");
					}
					// Install one-shot cleanup on drop/dragend
					const ws = this;
					if (restricted) {
						const cleanup = () => {
							setRestrictState(ws, false);
							window.removeEventListener(
								"dragend",
								cleanup,
								true,
							);
							window.removeEventListener("drop", cleanup, true);
						};
						window.addEventListener("dragend", cleanup, true);
						window.addEventListener("drop", cleanup, true);
					}
					return old && old.apply(this, [e, leaf]);
				},
			);
		},

		getDropLocation(old: Function | undefined) {
			return dedupe(
				KEY_GET_DROP,
				old as Function,
				function (this: any, ...args: any[]) {
					const target = old && old.apply(this, args);

					try {
						if (getRestrictState(this) && target) {
							const root =
								typeof target?.getRoot === "function"
									? target.getRoot()
									: undefined;
							const isCenterRegion =
								root &&
								root === this.rootSplit &&
								target !== this.leftSplit &&
								target !== this.rightSplit;
							if (isCenterRegion) {
								console.debug(
									"[Task Genius] Blocked center drop location for restricted leaf",
								);
								return null;
							}
						}
					} catch (err) {
						console.warn(
							"[Task Genius] getDropLocation patch error",
							err,
						);
					}
					return target;
				},
			);
		},
	});

	plugin.register(unpatch);
}
