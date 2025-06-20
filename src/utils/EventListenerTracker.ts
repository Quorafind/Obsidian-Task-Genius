/**
 * Event Listener Tracker for preventing memory leaks
 * Tracks and automatically cleans up event listeners when components are unloaded
 */

import { Component } from "obsidian";

export interface TrackedEventListener {
    element: EventTarget;
    type: string;
    listener: EventListener;
    options?: boolean | AddEventListenerOptions;
    component: Component;
    timestamp: number;
}

export class EventListenerTracker {
    private static instance: EventListenerTracker;
    private trackedListeners: Map<Component, TrackedEventListener[]> = new Map();
    private globalListeners: TrackedEventListener[] = [];

    private constructor() {}

    static getInstance(): EventListenerTracker {
        if (!EventListenerTracker.instance) {
            EventListenerTracker.instance = new EventListenerTracker();
        }
        return EventListenerTracker.instance;
    }

    /**
     * Track an event listener for a component
     */
    trackListener(
        component: Component,
        element: EventTarget,
        type: string,
        listener: EventListener,
        options?: boolean | AddEventListenerOptions
    ): void {
        const trackedListener: TrackedEventListener = {
            element,
            type,
            listener,
            options,
            component,
            timestamp: Date.now()
        };

        if (!this.trackedListeners.has(component)) {
            this.trackedListeners.set(component, []);
        }

        this.trackedListeners.get(component)!.push(trackedListener);

        // Also add to global list for debugging
        this.globalListeners.push(trackedListener);

        console.debug(`📡 Tracked event listener: ${type} on`, element, 'for component', component.constructor.name);
    }

    /**
     * Remove a specific event listener
     */
    removeListener(
        component: Component,
        element: EventTarget,
        type: string,
        listener: EventListener
    ): boolean {
        const componentListeners = this.trackedListeners.get(component);
        if (!componentListeners) return false;

        const index = componentListeners.findIndex(
            tracked => tracked.element === element && 
                      tracked.type === type && 
                      tracked.listener === listener
        );

        if (index !== -1) {
            const trackedListener = componentListeners[index];
            
            // Remove the actual event listener
            try {
                element.removeEventListener(type, listener, trackedListener.options);
                console.debug(`🗑️ Removed event listener: ${type} from`, element);
            } catch (error) {
                console.warn('Failed to remove event listener:', error);
            }

            // Remove from tracking
            componentListeners.splice(index, 1);
            
            // Remove from global list
            const globalIndex = this.globalListeners.findIndex(
                tracked => tracked === trackedListener
            );
            if (globalIndex !== -1) {
                this.globalListeners.splice(globalIndex, 1);
            }

            return true;
        }

        return false;
    }

    /**
     * Clean up all event listeners for a component
     */
    cleanupComponent(component: Component): void {
        const componentListeners = this.trackedListeners.get(component);
        if (!componentListeners) return;

        console.debug(`🧹 Cleaning up ${componentListeners.length} event listeners for component:`, component.constructor.name);

        for (const tracked of componentListeners) {
            try {
                tracked.element.removeEventListener(
                    tracked.type,
                    tracked.listener,
                    tracked.options
                );
                console.debug(`🗑️ Cleaned up event listener: ${tracked.type}`);
            } catch (error) {
                console.warn('Failed to cleanup event listener:', error);
            }
        }

        // Remove from global list
        this.globalListeners = this.globalListeners.filter(
            tracked => tracked.component !== component
        );

        // Remove component from tracking
        this.trackedListeners.delete(component);
    }

    /**
     * Get statistics about tracked listeners
     */
    getStats(): {
        totalListeners: number;
        componentCount: number;
        listenersByComponent: Map<string, number>;
        oldestListener: TrackedEventListener | null;
    } {
        const listenersByComponent = new Map<string, number>();
        let oldestListener: TrackedEventListener | null = null;

        for (const [component, listeners] of this.trackedListeners) {
            const componentName = component.constructor.name;
            listenersByComponent.set(componentName, listeners.length);

            for (const listener of listeners) {
                if (!oldestListener || listener.timestamp < oldestListener.timestamp) {
                    oldestListener = listener;
                }
            }
        }

        return {
            totalListeners: this.globalListeners.length,
            componentCount: this.trackedListeners.size,
            listenersByComponent,
            oldestListener
        };
    }

    /**
     * Find potential memory leaks (listeners that have been around too long)
     */
    findPotentialLeaks(maxAgeMs: number = 300000): TrackedEventListener[] {
        const now = Date.now();
        return this.globalListeners.filter(
            listener => (now - listener.timestamp) > maxAgeMs
        );
    }

    /**
     * Get detailed report of all tracked listeners
     */
    getDetailedReport(): string {
        const stats = this.getStats();
        const potentialLeaks = this.findPotentialLeaks();

        let report = `
📡 EVENT LISTENER TRACKER REPORT
===============================

📊 Statistics:
- Total Listeners: ${stats.totalListeners}
- Components with Listeners: ${stats.componentCount}

🧩 Listeners by Component:
`;

        for (const [componentName, count] of stats.listenersByComponent) {
            report += `- ${componentName}: ${count} listeners\n`;
        }

        if (potentialLeaks.length > 0) {
            report += `
⚠️ Potential Memory Leaks (listeners older than 5 minutes):
`;
            for (const leak of potentialLeaks) {
                const age = Math.round((Date.now() - leak.timestamp) / 1000);
                report += `- ${leak.type} on ${leak.element.constructor.name} (${age}s old) - Component: ${leak.component.constructor.name}\n`;
            }
        } else {
            report += `
✅ No potential leaks detected
`;
        }

        return report;
    }

    /**
     * Force cleanup of all listeners (emergency cleanup)
     */
    forceCleanupAll(): void {
        console.warn('🚨 Force cleaning up ALL tracked event listeners');
        
        for (const [component, listeners] of this.trackedListeners) {
            for (const tracked of listeners) {
                try {
                    tracked.element.removeEventListener(
                        tracked.type,
                        tracked.listener,
                        tracked.options
                    );
                } catch (error) {
                    console.warn('Failed to force cleanup event listener:', error);
                }
            }
        }

        this.trackedListeners.clear();
        this.globalListeners = [];
        console.log('🧹 All event listeners force cleaned up');
    }
}

/**
 * Enhanced Component base class that automatically tracks event listeners
 */
export class TrackedComponent extends Component {
    private eventTracker = EventListenerTracker.getInstance();

    /**
     * Override registerDomEvent to automatically track listeners
     */
    registerDomEvent<K extends keyof HTMLElementEventMap>(
        el: HTMLElement,
        type: K,
        callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): void;
    registerDomEvent<K extends keyof DocumentEventMap>(
        el: Document,
        type: K,
        callback: (this: Document, ev: DocumentEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): void;
    registerDomEvent<K extends keyof WindowEventMap>(
        el: Window,
        type: K,
        callback: (this: Window, ev: WindowEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions
    ): void;
    registerDomEvent(
        el: HTMLElement | Document | Window,
        type: string,
        callback: EventListener,
        options?: boolean | AddEventListenerOptions
    ): void {
        // Call the original method
        super.registerDomEvent(el as any, type as any, callback as any, options);
        
        // Track the listener
        this.eventTracker.trackListener(this, el, type, callback, options);
    }

    /**
     * Enhanced onunload that automatically cleans up tracked listeners
     */
    onunload(): void {
        // Clean up tracked listeners
        this.eventTracker.cleanupComponent(this);
        
        // Call parent onunload
        super.onunload();
    }
}
