/**
 * Memory Leak Detector for Obsidian Task Genius Plugin
 * Detects common memory leak patterns, especially Component lifecycle management issues
 */

import { Component } from "obsidian";
import TaskProgressBarPlugin from "../index";

export interface LeakDetectionResult {
    componentLeaks: ComponentLeak[];
    eventListenerLeaks: EventListenerLeak[];
    domElementLeaks: DOMElementLeak[];
    recommendations: string[];
}

export interface ComponentLeak {
    componentName: string;
    instanceCount: number;
    hasParent: boolean;
    hasEventListeners: boolean;
    severity: 'low' | 'medium' | 'high';
}

export interface EventListenerLeak {
    elementType: string;
    eventType: string;
    listenerCount: number;
    isOrphaned: boolean;
    severity: 'low' | 'medium' | 'high';
}

export interface DOMElementLeak {
    elementType: string;
    elementCount: number;
    hasEventListeners: boolean;
    isDetached: boolean;
    severity: 'low' | 'medium' | 'high';
}

export class MemoryLeakDetector extends Component {
    private plugin: TaskProgressBarPlugin;
    private componentRegistry: WeakMap<Component, ComponentInfo> = new WeakMap();
    private detectionInterval: number | null = null;
    private isEnabled: boolean = false;

    constructor(plugin: TaskProgressBarPlugin) {
        super();
        this.plugin = plugin;
    }

    /**
     * Enable memory leak detection
     */
    enable(): void {
        if (this.isEnabled) return;
        
        this.isEnabled = true;
        console.log("🔍 Memory Leak Detector enabled");
        
        // Start periodic detection
        this.startPeriodicDetection();
        
        // Monitor component creation and destruction
        this.patchComponentLifecycle();
    }

    /**
     * Disable memory leak detection
     */
    disable(): void {
        if (!this.isEnabled) return;
        
        this.isEnabled = false;
        this.stopPeriodicDetection();
        console.log("🔍 Memory Leak Detector disabled");
    }

    /**
     * Perform memory leak detection
     */
    detectLeaks(): LeakDetectionResult {
        const result: LeakDetectionResult = {
            componentLeaks: this.detectComponentLeaks(),
            eventListenerLeaks: this.detectEventListenerLeaks(),
            domElementLeaks: this.detectDOMElementLeaks(),
            recommendations: []
        };

        // Generate recommendations
        result.recommendations = this.generateRecommendations(result);

        return result;
    }

    /**
     * Detect component leaks
     */
    private detectComponentLeaks(): ComponentLeak[] {
        const leaks: ComponentLeak[] = [];
        const componentCounts = new Map<string, number>();
        const componentInfo = new Map<string, { hasParent: boolean; hasEventListeners: boolean }>();

        // Count component instances
        document.querySelectorAll('[data-component]').forEach(el => {
            const componentName = el.getAttribute('data-component') || 'Unknown';
            componentCounts.set(componentName, (componentCounts.get(componentName) || 0) + 1);
        });

        // Analyze each component type
        for (const [componentName, count] of componentCounts) {
            const info = componentInfo.get(componentName) || { hasParent: false, hasEventListeners: false };
            
            let severity: 'low' | 'medium' | 'high' = 'low';
            if (count > 50) severity = 'high';
            else if (count > 20) severity = 'medium';

            leaks.push({
                componentName,
                instanceCount: count,
                hasParent: info.hasParent,
                hasEventListeners: info.hasEventListeners,
                severity
            });
        }

        return leaks.filter(leak => leak.severity !== 'low' || leak.instanceCount > 10);
    }

    /**
     * Detect event listener leaks
     */
    private detectEventListenerLeaks(): EventListenerLeak[] {
        const leaks: EventListenerLeak[] = [];
        
        // Detect common event listener leak patterns
        const suspiciousElements = document.querySelectorAll('[data-event-listeners]');
        const eventTypeCounts = new Map<string, number>();

        suspiciousElements.forEach(el => {
            const eventTypes = el.getAttribute('data-event-listeners')?.split(',') || [];
            eventTypes.forEach(eventType => {
                eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) || 0) + 1);
            });
        });

        for (const [eventType, count] of eventTypeCounts) {
            if (count > 100) {
                leaks.push({
                    elementType: 'Various',
                    eventType,
                    listenerCount: count,
                    isOrphaned: false, // Requires more complex detection logic
                    severity: count > 500 ? 'high' : count > 200 ? 'medium' : 'low'
                });
            }
        }

        return leaks;
    }

    /**
     * Detect DOM element leaks
     */
    private detectDOMElementLeaks(): DOMElementLeak[] {
        const leaks: DOMElementLeak[] = [];
        const elementCounts = new Map<string, number>();

        // Count various element types
        document.querySelectorAll('*').forEach(el => {
            const tagName = el.tagName.toLowerCase();
            elementCounts.set(tagName, (elementCounts.get(tagName) || 0) + 1);
        });

        // Detect suspicious element counts
        const suspiciousTags = ['div', 'span', 'svg', 'g', 'rect', 'text'];
        
        for (const [tagName, count] of elementCounts) {
            if (suspiciousTags.includes(tagName) && count > 1000) {
                leaks.push({
                    elementType: tagName,
                    elementCount: count,
                    hasEventListeners: false, // Requires more detailed detection
                    isDetached: false, // Requires more detailed detection
                    severity: count > 5000 ? 'high' : count > 2000 ? 'medium' : 'low'
                });
            }
        }

        return leaks;
    }

    /**
     * Generate fix recommendations
     */
    private generateRecommendations(result: LeakDetectionResult): string[] {
        const recommendations: string[] = [];

        // Component leak recommendations
        const highSeverityComponents = result.componentLeaks.filter(leak => leak.severity === 'high');
        if (highSeverityComponents.length > 0) {
            recommendations.push(
                `🔴 Found ${highSeverityComponents.length} high-risk component leaks. Ensure all Components are added to parent components using addChild().`
            );
        }

        // Event listener recommendations
        const highSeverityListeners = result.eventListenerLeaks.filter(leak => leak.severity === 'high');
        if (highSeverityListeners.length > 0) {
            recommendations.push(
                `🔴 Found ${highSeverityListeners.length} high-risk event listener leaks. Use registerDomEvent() instead of addEventListener().`
            );
        }

        // DOM element recommendations
        const highSeverityDOM = result.domElementLeaks.filter(leak => leak.severity === 'high');
        if (highSeverityDOM.length > 0) {
            recommendations.push(
                `🔴 Found ${highSeverityDOM.length} high-risk DOM element leaks. Clean up DOM elements in onunload().`
            );
        }

        // General recommendations
        if (recommendations.length === 0) {
            recommendations.push("✅ No obvious memory leak issues found.");
        } else {
            recommendations.push(
                "💡 Recommendations: 1) Use registerDomEvent() to register event listeners; 2) Use addChild() to manage component lifecycle; 3) Clean up resources in onunload()."
            );
        }

        return recommendations;
    }

    /**
     * Start periodic detection
     */
    private startPeriodicDetection(): void {
        this.detectionInterval = window.setInterval(() => {
            const result = this.detectLeaks();
            const highRiskIssues = [
                ...result.componentLeaks.filter(l => l.severity === 'high'),
                ...result.eventListenerLeaks.filter(l => l.severity === 'high'),
                ...result.domElementLeaks.filter(l => l.severity === 'high')
            ];

            if (highRiskIssues.length > 0) {
                console.warn(`🚨 Memory leak detection: ${highRiskIssues.length} high-risk issues found`);
                console.log("Detection result:", result);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop periodic detection
     */
    private stopPeriodicDetection(): void {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
    }

    /**
     * Patch component lifecycle for monitoring
     */
    private patchComponentLifecycle(): void {
        // More complex component lifecycle monitoring logic can be added here
        // Since Obsidian's Component class is sealed, we can only perform limited monitoring
    }

    /**
     * Generate detailed report
     */
    generateDetailedReport(): string {
        const result = this.detectLeaks();
        
        let report = `
🔍 MEMORY LEAK DETECTION REPORT
==============================

📊 Summary:
- Component Leaks: ${result.componentLeaks.length}
- Event Listener Leaks: ${result.eventListenerLeaks.length}
- DOM Element Leaks: ${result.domElementLeaks.length}

`;

        // Component leak details
        if (result.componentLeaks.length > 0) {
            report += `\n🧩 Component Leaks:\n`;
            result.componentLeaks.forEach(leak => {
                report += `- ${leak.componentName}: ${leak.instanceCount} instances (${leak.severity})\n`;
            });
        }

        // Event listener leak details
        if (result.eventListenerLeaks.length > 0) {
            report += `\n📡 Event Listener Leaks:\n`;
            result.eventListenerLeaks.forEach(leak => {
                report += `- ${leak.eventType}: ${leak.listenerCount} listeners (${leak.severity})\n`;
            });
        }

        // DOM element leak details
        if (result.domElementLeaks.length > 0) {
            report += `\n🏗️ DOM Element Leaks:\n`;
            result.domElementLeaks.forEach(leak => {
                report += `- ${leak.elementType}: ${leak.elementCount} elements (${leak.severity})\n`;
            });
        }

        // Recommendations
        report += `\n💡 Recommendations:\n`;
        result.recommendations.forEach(rec => {
            report += `${rec}\n`;
        });

        return report;
    }

    onunload(): void {
        this.disable();
        this.componentRegistry = new WeakMap();
    }
}

interface ComponentInfo {
    name: string;
    hasParent: boolean;
    eventListenerCount: number;
    createdAt: number;
}
