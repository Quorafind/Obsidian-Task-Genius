/**
 * Gantt Chart Virtualization Manager
 *
 * Handles virtual scrolling for grouped content, efficient group rendering,
 * lazy loading of group content, and memory management for complex group hierarchies.
 */

import { Component } from "obsidian";
import { Task } from "../../types/task";
import { TaskGroup } from "../../types/gantt-grouping";

// Import GanttTaskItem from the main gantt file since it's not a grouping-specific type
interface GanttTaskItem {
	task: Task;
	y: number;
	startX?: number;
	endX?: number;
	width?: number;
	isMilestone: boolean;
	level: number;
}

export interface VirtualizationConfig {
	// Viewport settings
	viewportHeight: number;
	viewportWidth: number;

	// Item dimensions
	rowHeight: number;
	groupHeaderHeight: number;

	// Performance settings
	overscanCount: number; // Number of items to render outside viewport
	bufferSize: number; // Buffer size for smooth scrolling
	lazyLoadThreshold: number; // Distance from viewport to start loading

	// Memory management
	maxCachedItems: number;
	cleanupInterval: number; // Cleanup interval in ms
}

export interface VirtualItem {
	index: number;
	y: number;
	height: number;
	type: "task" | "group-header";
	data: Task | TaskGroup;
	groupId?: string;
	level?: number;
	visible: boolean;
}

export interface ViewportInfo {
	startIndex: number;
	endIndex: number;
	visibleItems: VirtualItem[];
	totalHeight: number;
	scrollTop: number;
}

export class VirtualizationManager extends Component {
	private config: VirtualizationConfig;
	private virtualItems: VirtualItem[] = [];
	private cachedItems: Map<number, VirtualItem> = new Map();
	private viewportInfo: ViewportInfo;
	private cleanupTimer: number | null = null;

	// Performance tracking
	private renderCount = 0;
	private lastRenderTime = 0;

	constructor(config: VirtualizationConfig) {
		super();
		this.config = config;
		this.viewportInfo = {
			startIndex: 0,
			endIndex: 0,
			visibleItems: [],
			totalHeight: 0,
			scrollTop: 0,
		};
	}

	onload(): void {
		this.startCleanupTimer();
	}

	onunload(): void {
		this.stopCleanupTimer();
		this.cachedItems.clear();
	}

	/**
	 * Update configuration
	 */
	updateConfig(newConfig: Partial<VirtualizationConfig>): void {
		this.config = { ...this.config, ...newConfig };
		this.invalidateCache();
	}

	/**
	 * Build virtual items from task groups
	 */
	buildVirtualItems(groups: TaskGroup[]): VirtualItem[] {
		const items: VirtualItem[] = [];
		let currentY = 0;
		let index = 0;

		const processGroup = (group: TaskGroup, level: number = 0) => {
			// Add group header
			const headerItem: VirtualItem = {
				index: index++,
				y: currentY,
				height: this.config.groupHeaderHeight,
				type: "group-header",
				data: group,
				groupId: group.id,
				level: level,
				visible: true,
			};
			items.push(headerItem);
			currentY += this.config.groupHeaderHeight;

			// Add tasks if group is expanded
			if (group.expanded) {
				// Process subgroups first
				if (group.subGroups && group.subGroups.length > 0) {
					for (const subGroup of group.subGroups) {
						processGroup(subGroup, level + 1);
					}
				} else {
					// Add tasks
					for (const task of group.tasks) {
						const taskItem: VirtualItem = {
							index: index++,
							y: currentY,
							height: this.config.rowHeight,
							type: "task",
							data: task,
							groupId: group.id,
							level: level + 1,
							visible: true,
						};
						items.push(taskItem);
						currentY += this.config.rowHeight;
					}
				}
			}
		};

		for (const group of groups) {
			processGroup(group);
		}

		this.virtualItems = items;
		this.viewportInfo.totalHeight = currentY;
		return items;
	}

	/**
	 * Calculate visible items based on scroll position
	 */
	calculateVisibleItems(scrollTop: number): ViewportInfo {
		const startTime = performance.now();

		this.viewportInfo.scrollTop = scrollTop;

		// Find start and end indices
		const viewportStart = scrollTop;
		const viewportEnd = scrollTop + this.config.viewportHeight;

		// Add overscan
		const overscanStart = Math.max(
			0,
			viewportStart - this.config.bufferSize
		);
		const overscanEnd = viewportEnd + this.config.bufferSize;

		let startIndex = 0;
		let endIndex = this.virtualItems.length - 1;

		// Binary search for start index
		let left = 0;
		let right = this.virtualItems.length - 1;
		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const item = this.virtualItems[mid];
			if (item.y + item.height < overscanStart) {
				left = mid + 1;
			} else {
				right = mid - 1;
				startIndex = mid;
			}
		}

		// Binary search for end index
		left = startIndex;
		right = this.virtualItems.length - 1;
		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			const item = this.virtualItems[mid];
			if (item.y > overscanEnd) {
				right = mid - 1;
			} else {
				left = mid + 1;
				endIndex = mid;
			}
		}

		// Add overscan items
		startIndex = Math.max(0, startIndex - this.config.overscanCount);
		endIndex = Math.min(
			this.virtualItems.length - 1,
			endIndex + this.config.overscanCount
		);

		// Get visible items
		const visibleItems = this.virtualItems.slice(startIndex, endIndex + 1);

		// Update viewport info
		this.viewportInfo = {
			startIndex,
			endIndex,
			visibleItems,
			totalHeight: this.viewportInfo.totalHeight,
			scrollTop,
		};

		// Performance tracking
		this.renderCount++;
		this.lastRenderTime = performance.now() - startTime;

		return this.viewportInfo;
	}

	/**
	 * Get cached item or create new one
	 */
	getCachedItem(index: number): VirtualItem | null {
		if (this.cachedItems.has(index)) {
			return this.cachedItems.get(index)!;
		}

		if (index >= 0 && index < this.virtualItems.length) {
			const item = this.virtualItems[index];
			this.cacheItem(index, item);
			return item;
		}

		return null;
	}

	/**
	 * Cache an item
	 */
	private cacheItem(index: number, item: VirtualItem): void {
		// Implement LRU cache
		if (this.cachedItems.size >= this.config.maxCachedItems) {
			// Remove oldest item
			const firstKey = this.cachedItems.keys().next().value;
			this.cachedItems.delete(firstKey);
		}

		this.cachedItems.set(index, { ...item });
	}

	/**
	 * Invalidate cache
	 */
	private invalidateCache(): void {
		this.cachedItems.clear();
	}

	/**
	 * Start cleanup timer
	 */
	private startCleanupTimer(): void {
		this.cleanupTimer = window.setInterval(() => {
			this.cleanup();
		}, this.config.cleanupInterval);
	}

	/**
	 * Stop cleanup timer
	 */
	private stopCleanupTimer(): void {
		if (this.cleanupTimer) {
			clearInterval(this.cleanupTimer);
			this.cleanupTimer = null;
		}
	}

	/**
	 * Cleanup unused cached items
	 */
	private cleanup(): void {
		const currentTime = Date.now();
		const maxAge = 30000; // 30 seconds

		// Remove items that are far from current viewport
		const { startIndex, endIndex } = this.viewportInfo;
		const keepRange = this.config.overscanCount * 2;

		for (const [index] of this.cachedItems) {
			if (
				index < startIndex - keepRange ||
				index > endIndex + keepRange
			) {
				this.cachedItems.delete(index);
			}
		}
	}

	/**
	 * Get performance metrics
	 */
	getPerformanceMetrics(): {
		renderCount: number;
		lastRenderTime: number;
		cachedItemsCount: number;
		virtualItemsCount: number;
		averageRenderTime: number;
	} {
		return {
			renderCount: this.renderCount,
			lastRenderTime: this.lastRenderTime,
			cachedItemsCount: this.cachedItems.size,
			virtualItemsCount: this.virtualItems.length,
			averageRenderTime:
				this.renderCount > 0
					? this.lastRenderTime / this.renderCount
					: 0,
		};
	}

	/**
	 * Reset performance counters
	 */
	resetPerformanceMetrics(): void {
		this.renderCount = 0;
		this.lastRenderTime = 0;
	}

	/**
	 * Get current viewport info
	 */
	getViewportInfo(): ViewportInfo {
		return { ...this.viewportInfo };
	}

	/**
	 * Check if lazy loading should be triggered
	 */
	shouldLazyLoad(itemIndex: number): boolean {
		const { startIndex, endIndex } = this.viewportInfo;
		const distance = Math.min(
			Math.abs(itemIndex - startIndex),
			Math.abs(itemIndex - endIndex)
		);

		return distance <= this.config.lazyLoadThreshold;
	}

	/**
	 * Estimate total height without building all items
	 */
	estimateTotalHeight(groups: TaskGroup[]): number {
		let totalHeight = 0;

		const estimateGroup = (group: TaskGroup): number => {
			let height = this.config.groupHeaderHeight;

			if (group.expanded) {
				if (group.subGroups && group.subGroups.length > 0) {
					height += group.subGroups.reduce(
						(sum, subGroup) => sum + estimateGroup(subGroup),
						0
					);
				} else {
					height += group.tasks.length * this.config.rowHeight;
				}
			}

			return height;
		};

		for (const group of groups) {
			totalHeight += estimateGroup(group);
		}

		return totalHeight;
	}
}
