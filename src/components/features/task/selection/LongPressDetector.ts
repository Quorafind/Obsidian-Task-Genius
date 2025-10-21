/**
 * Long press detector for mobile devices
 * Detects when user long-presses an element to enter selection mode
 */

import { Component } from "obsidian";
import { LongPressOptions } from "@/types/selection";

export class LongPressDetector extends Component {
	private timers: Map<HTMLElement, number> = new Map();
	private startPositions: Map<HTMLElement, { x: number; y: number }> =
		new Map();
	private activeElements: Set<HTMLElement> = new Set();

	/**
	 * Start detecting long press on an element
	 */
	public startDetection(
		element: HTMLElement,
		options: LongPressOptions
	): void {
		const threshold = options.threshold || 500;
		const moveTolerance = options.moveTolerance || 10;

		// Cleanup previous detection on this element
		this.stopDetection(element);

		// Touch start handler
		const handleTouchStart = (e: TouchEvent) => {
			// Ignore if already in a long press
			if (this.timers.has(element)) {
				return;
			}

			const touch = e.touches[0];
			if (!touch) return;

			// Store start position
			this.startPositions.set(element, {
				x: touch.clientX,
				y: touch.clientY,
			});

			// Trigger start callback
			if (options.onLongPressStart) {
				options.onLongPressStart();
			}

			// Set timer for long press detection
			const timer = window.setTimeout(() => {
				// Long press detected
				this.timers.delete(element);
				this.startPositions.delete(element);
				options.onLongPress();
			}, threshold);

			this.timers.set(element, timer);
		};

		// Touch move handler - cancel if moved too far
		const handleTouchMove = (e: TouchEvent) => {
			const timer = this.timers.get(element);
			if (!timer) return;

			const touch = e.touches[0];
			if (!touch) return;

			const startPos = this.startPositions.get(element);
			if (!startPos) return;

			// Calculate movement
			const deltaX = Math.abs(touch.clientX - startPos.x);
			const deltaY = Math.abs(touch.clientY - startPos.y);

			// Cancel if moved too far
			if (deltaX > moveTolerance || deltaY > moveTolerance) {
				this.cancelDetection(element, options);
			}
		};

		// Touch end/cancel handlers
		const handleTouchEnd = () => {
			this.cancelDetection(element, options);
		};

		const handleTouchCancel = () => {
			this.cancelDetection(element, options);
		};

		// Register event listeners
		this.registerDomEvent(element, "touchstart", handleTouchStart, {
			passive: true,
		});
		this.registerDomEvent(element, "touchmove", handleTouchMove, {
			passive: true,
		});
		this.registerDomEvent(element, "touchend", handleTouchEnd);
		this.registerDomEvent(element, "touchcancel", handleTouchCancel);

		// Mark element as active
		this.activeElements.add(element);
	}

	/**
	 * Stop detecting long press on an element
	 */
	public stopDetection(element: HTMLElement): void {
		// Clear timer
		const timer = this.timers.get(element);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(element);
		}

		// Clear position
		this.startPositions.delete(element);

		// Remove from active elements
		this.activeElements.delete(element);
	}

	/**
	 * Cancel long press detection
	 */
	private cancelDetection(
		element: HTMLElement,
		options: LongPressOptions
	): void {
		const timer = this.timers.get(element);
		if (timer) {
			clearTimeout(timer);
			this.timers.delete(element);
			this.startPositions.delete(element);

			// Trigger cancel callback
			if (options.onLongPressCancel) {
				options.onLongPressCancel();
			}
		}
	}

	/**
	 * Cleanup all detections
	 */
	public cleanup(): void {
		// Clear all timers
		for (const timer of this.timers.values()) {
			clearTimeout(timer);
		}
		this.timers.clear();
		this.startPositions.clear();
		this.activeElements.clear();
	}

	/**
	 * Component unload
	 */
	onunload(): void {
		this.cleanup();
	}
}
