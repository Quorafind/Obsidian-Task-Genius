/**
 * Memory Profiler for debugging memory leaks in Task Genius plugin
 */

import { Component } from "obsidian";
import TaskProgressBarPlugin from "../index";

export interface MemorySnapshot {
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
    componentCount: number;
    eventListenerCount: number;
    workerCount: number;
    timerCount: number;
    domElementCount: number;
}

export interface ComponentMemoryInfo {
    name: string;
    instanceCount: number;
    eventListeners: number;
    domElements: number;
    children: number;
}

export class MemoryProfiler extends Component {
    private plugin: TaskProgressBarPlugin;
    private snapshots: MemorySnapshot[] = [];
    private componentRegistry: Map<string, Set<Component>> = new Map();
    private eventListenerRegistry: Map<Component, number> = new Map();
    private timerRegistry: Set<number> = new Set();
    private intervalRegistry: Set<number> = new Set();
    private rafRegistry: Set<number> = new Set();
    private workerRegistry: Set<Worker> = new Set();
    private profilingInterval: number | null = null;
    private isEnabled: boolean = false;

    constructor(plugin: TaskProgressBarPlugin) {
        super();
        this.plugin = plugin;
    }

    /**
     * Enable memory profiling
     */
    enable(): void {
        if (this.isEnabled) return;
        
        this.isEnabled = true;
        console.log("🔍 Memory Profiler enabled");
        
        // Start periodic snapshots
        this.startPeriodicSnapshots();
        
        // Patch component creation to track instances
        this.patchComponentCreation();
        
        // Patch timer/interval creation
        this.patchTimerCreation();
        
        // Patch worker creation
        this.patchWorkerCreation();
    }

    /**
     * Disable memory profiling
     */
    disable(): void {
        if (!this.isEnabled) return;
        
        this.isEnabled = false;
        this.stopPeriodicSnapshots();
        console.log("🔍 Memory Profiler disabled");
    }

    /**
     * Take a memory snapshot
     */
    takeSnapshot(): MemorySnapshot {
        const memInfo = (performance as any).memory || {};
        
        const snapshot: MemorySnapshot = {
            timestamp: Date.now(),
            heapUsed: memInfo.usedJSHeapSize || 0,
            heapTotal: memInfo.totalJSHeapSize || 0,
            external: 0, // Not available in browser
            arrayBuffers: 0, // Not easily measurable
            componentCount: this.getTotalComponentCount(),
            eventListenerCount: this.getTotalEventListenerCount(),
            workerCount: this.workerRegistry.size,
            timerCount: this.timerRegistry.size + this.intervalRegistry.size + this.rafRegistry.size,
            domElementCount: this.getDOMElementCount()
        };

        this.snapshots.push(snapshot);
        
        // Keep only last 100 snapshots
        if (this.snapshots.length > 100) {
            this.snapshots.shift();
        }

        return snapshot;
    }

    /**
     * Get memory usage report
     */
    getMemoryReport(): string {
        if (this.snapshots.length === 0) {
            return "No memory snapshots available. Enable profiling first.";
        }

        const latest = this.snapshots[this.snapshots.length - 1];
        const oldest = this.snapshots[0];
        
        const heapGrowth = latest.heapUsed - oldest.heapUsed;
        const componentGrowth = latest.componentCount - oldest.componentCount;
        const listenerGrowth = latest.eventListenerCount - oldest.eventListenerCount;
        
        let report = `
🔍 MEMORY PROFILER REPORT
========================

📊 Current Memory Usage:
- Heap Used: ${this.formatBytes(latest.heapUsed)}
- Heap Total: ${this.formatBytes(latest.heapTotal)}
- Components: ${latest.componentCount}
- Event Listeners: ${latest.eventListenerCount}
- Workers: ${latest.workerCount}
- Timers/Intervals: ${latest.timerCount}
- DOM Elements: ${latest.domElementCount}

📈 Growth Since Start:
- Heap Growth: ${this.formatBytes(heapGrowth)} ${heapGrowth > 0 ? '⚠️' : '✅'}
- Component Growth: ${componentGrowth} ${componentGrowth > 10 ? '⚠️' : '✅'}
- Listener Growth: ${listenerGrowth} ${listenerGrowth > 50 ? '⚠️' : '✅'}

🧩 Component Breakdown:
${this.getComponentBreakdown()}

⚠️ Potential Issues:
${this.detectPotentialLeaks()}
`;

        return report;
    }

    /**
     * Detect potential memory leaks
     */
    private detectPotentialLeaks(): string {
        const issues: string[] = [];
        
        if (this.snapshots.length < 2) return "Not enough data";
        
        const latest = this.snapshots[this.snapshots.length - 1];
        const previous = this.snapshots[Math.max(0, this.snapshots.length - 10)];
        
        // Check for consistent growth
        const heapGrowth = latest.heapUsed - previous.heapUsed;
        const componentGrowth = latest.componentCount - previous.componentCount;
        const listenerGrowth = latest.eventListenerCount - previous.eventListenerCount;
        
        if (heapGrowth > 10 * 1024 * 1024) { // 10MB growth
            issues.push(`- Large heap growth: ${this.formatBytes(heapGrowth)}`);
        }
        
        if (componentGrowth > 20) {
            issues.push(`- Component count growing: +${componentGrowth}`);
        }
        
        if (listenerGrowth > 100) {
            issues.push(`- Event listener count growing: +${listenerGrowth}`);
        }
        
        if (this.workerRegistry.size > 10) {
            issues.push(`- High worker count: ${this.workerRegistry.size}`);
        }
        
        if (this.timerRegistry.size + this.intervalRegistry.size > 50) {
            issues.push(`- High timer count: ${this.timerRegistry.size + this.intervalRegistry.size}`);
        }
        
        return issues.length > 0 ? issues.join('\n') : "No obvious leaks detected ✅";
    }

    /**
     * Get component breakdown
     */
    private getComponentBreakdown(): string {
        const breakdown: string[] = [];
        
        for (const [name, instances] of this.componentRegistry) {
            const count = instances.size;
            const totalListeners = Array.from(instances)
                .reduce((sum, comp) => sum + (this.eventListenerRegistry.get(comp) || 0), 0);
            
            breakdown.push(`- ${name}: ${count} instances, ${totalListeners} listeners`);
        }
        
        return breakdown.length > 0 ? breakdown.join('\n') : "No component data available";
    }

    /**
     * Start periodic memory snapshots
     */
    private startPeriodicSnapshots(): void {
        this.profilingInterval = window.setInterval(() => {
            this.takeSnapshot();
        }, 5000); // Every 5 seconds
    }

    /**
     * Stop periodic snapshots
     */
    private stopPeriodicSnapshots(): void {
        if (this.profilingInterval) {
            clearInterval(this.profilingInterval);
            this.profilingInterval = null;
        }
    }

    /**
     * Patch component creation to track instances
     */
    private patchComponentCreation(): void {
        // This would require more complex patching of Obsidian's Component class
        // For now, we'll rely on manual registration
    }

    /**
     * Register a component for tracking
     */
    registerComponent(component: Component, name: string): void {
        if (!this.componentRegistry.has(name)) {
            this.componentRegistry.set(name, new Set());
        }
        this.componentRegistry.get(name)!.add(component);
    }

    /**
     * Unregister a component
     */
    unregisterComponent(component: Component, name: string): void {
        const instances = this.componentRegistry.get(name);
        if (instances) {
            instances.delete(component);
            if (instances.size === 0) {
                this.componentRegistry.delete(name);
            }
        }
        this.eventListenerRegistry.delete(component);
    }

    /**
     * Track event listener count for a component
     */
    trackEventListeners(component: Component, count: number): void {
        this.eventListenerRegistry.set(component, count);
    }

    /**
     * Patch timer creation
     */
    private patchTimerCreation(): void {
        const originalSetTimeout = window.setTimeout;
        const originalSetInterval = window.setInterval;
        const originalRequestAnimationFrame = window.requestAnimationFrame;
        
        window.setTimeout = (callback: any, delay?: number, ...args: any[]) => {
            const id = originalSetTimeout(callback, delay, ...args);
            this.timerRegistry.add(id);
            return id;
        };
        
        window.setInterval = (callback: any, delay?: number, ...args: any[]) => {
            const id = originalSetInterval(callback, delay, ...args);
            this.intervalRegistry.add(id);
            return id;
        };
        
        window.requestAnimationFrame = (callback: FrameRequestCallback) => {
            const id = originalRequestAnimationFrame(callback);
            this.rafRegistry.add(id);
            return id;
        };
    }

    /**
     * Patch worker creation
     */
    private patchWorkerCreation(): void {
        // Track workers manually since patching Worker constructor is complex
    }

    /**
     * Register a worker for tracking
     */
    registerWorker(worker: Worker): void {
        this.workerRegistry.add(worker);
    }

    /**
     * Unregister a worker
     */
    unregisterWorker(worker: Worker): void {
        this.workerRegistry.delete(worker);
    }

    /**
     * Get total component count
     */
    private getTotalComponentCount(): number {
        return Array.from(this.componentRegistry.values())
            .reduce((sum, instances) => sum + instances.size, 0);
    }

    /**
     * Get total event listener count
     */
    private getTotalEventListenerCount(): number {
        return Array.from(this.eventListenerRegistry.values())
            .reduce((sum, count) => sum + count, 0);
    }

    /**
     * Get DOM element count (approximate)
     */
    private getDOMElementCount(): number {
        return document.querySelectorAll('*').length;
    }

    /**
     * Format bytes to human readable format
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Force garbage collection (if available)
     */
    forceGC(): void {
        if ((window as any).gc) {
            (window as any).gc();
            console.log("🗑️ Forced garbage collection");
        } else {
            console.warn("Garbage collection not available. Run Chrome with --js-flags='--expose-gc'");
        }
    }

    onunload(): void {
        this.disable();
        this.componentRegistry.clear();
        this.eventListenerRegistry.clear();
        this.timerRegistry.clear();
        this.intervalRegistry.clear();
        this.rafRegistry.clear();
        this.workerRegistry.clear();
        this.snapshots = [];
    }
}
