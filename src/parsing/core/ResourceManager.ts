/**
 * Resource Manager
 * 
 * Centralized resource management system that automatically tracks and cleans up
 * various types of resources including timers, workers, event listeners, caches,
 * and file handles. Extends Obsidian's Component for proper lifecycle management.
 */

import { Component, EventRef } from 'obsidian';

/**
 * Resource types that can be managed
 */
export type ResourceType = 
    | 'timer'
    | 'interval' 
    | 'worker'
    | 'event_listener'
    | 'cache'
    | 'file_handle'
    | 'memory_allocation'
    | 'websocket'
    | 'stream'
    | 'observer'
    | 'custom';

/**
 * Resource descriptor interface
 */
export interface ManagedResource {
    id: string;
    type: ResourceType;
    description: string;
    created: number;
    lastAccessed: number;
    accessCount: number;
    estimatedMemoryUsage: number;
    cleanup: () => Promise<void> | void;
    isActive: () => boolean;
    getMetrics?: () => Record<string, any>;
    priority: 'low' | 'medium' | 'high' | 'critical';
    tags: string[];
    dependencies?: string[]; // IDs of resources this depends on
}

/**
 * Resource group for organizing related resources
 */
export interface ResourceGroup {
    id: string;
    name: string;
    description: string;
    resources: Set<string>;
    cleanupOrder: number; // Lower numbers cleaned up first
    autoCleanup: boolean;
}

/**
 * Resource usage statistics
 */
export interface ResourceStats {
    totalResources: number;
    resourcesByType: Record<ResourceType, number>;
    memoryUsage: {
        total: number;
        byType: Record<ResourceType, number>;
        trending: 'increasing' | 'stable' | 'decreasing';
    };
    performance: {
        avgCleanupTime: number;
        maxCleanupTime: number;
        totalCleanups: number;
        failedCleanups: number;
    };
    health: {
        status: 'healthy' | 'warning' | 'critical';
        leakedResources: number;
        zombieResources: number;
        stalledCleanups: number;
    };
}

/**
 * Configuration for resource manager
 */
export interface ResourceManagerConfig {
    maxResources: number;
    memoryWarningThreshold: number; // MB
    memoryCriticalThreshold: number; // MB
    cleanupInterval: number; // ms
    maxCleanupTime: number; // ms
    enableAutoCleanup: boolean;
    enableLeakDetection: boolean;
    enableMetrics: boolean;
    debug: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: ResourceManagerConfig = {
    maxResources: 10000,
    memoryWarningThreshold: 100, // 100MB
    memoryCriticalThreshold: 500, // 500MB
    cleanupInterval: 30000, // 30 seconds
    maxCleanupTime: 5000, // 5 seconds
    enableAutoCleanup: true,
    enableLeakDetection: true,
    enableMetrics: true,
    debug: false
};

/**
 * ResourceManager class for automatic resource management
 */
export class ResourceManager extends Component {
    private resources = new Map<string, ManagedResource>();
    private resourceGroups = new Map<string, ResourceGroup>();
    private config: ResourceManagerConfig;
    
    // Cleanup tracking
    private cleanupTimer?: NodeJS.Timeout;
    private activeCleanups = new Set<string>();
    private cleanupStats = {
        totalCleanups: 0,
        failedCleanups: 0,
        totalCleanupTime: 0,
        maxCleanupTime: 0
    };
    
    // Memory tracking
    private memoryHistory: number[] = [];
    private lastMemoryCheck = 0;
    
    // Leak detection
    private resourceCreationHistory = new Map<string, number>();
    private potentialLeaks = new Set<string>();
    
    // Event tracking for debugging
    private eventLog: Array<{
        timestamp: number;
        type: 'created' | 'accessed' | 'cleaned' | 'leaked' | 'error';
        resourceId: string;
        details?: any;
    }> = [];

    constructor(config: Partial<ResourceManagerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.initialize();
    }

    /**
     * Initialize the resource manager
     */
    private initialize(): void {
        this.log('Initializing ResourceManager');
        
        if (this.config.enableAutoCleanup) {
            this.startAutoCleanup();
        }
        
        if (this.config.enableLeakDetection) {
            this.startLeakDetection();
        }
        
        // Register global error handlers for resource cleanup
        this.setupErrorHandlers();
        
        this.log('ResourceManager initialized');
    }

    /**
     * Register a resource for management
     */
    public registerResource(resource: Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'>): string {
        const managedResource: ManagedResource = {
            ...resource,
            created: Date.now(),
            lastAccessed: Date.now(),
            accessCount: 1
        };

        this.resources.set(resource.id, managedResource);
        
        // Track creation for leak detection
        if (this.config.enableLeakDetection) {
            const typeCount = this.resourceCreationHistory.get(resource.type) || 0;
            this.resourceCreationHistory.set(resource.type, typeCount + 1);
        }

        // Log the event
        this.logEvent('created', resource.id, {
            type: resource.type,
            description: resource.description
        });

        this.log(`Registered ${resource.type} resource: ${resource.id}`);
        
        // Check if we're approaching limits
        this.checkResourceLimits();
        
        return resource.id;
    }

    /**
     * Register multiple resources as a group
     */
    public registerResourceGroup(
        groupId: string,
        groupName: string,
        resources: Array<Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'>>,
        options: {
            description?: string;
            cleanupOrder?: number;
            autoCleanup?: boolean;
        } = {}
    ): void {
        const resourceIds = new Set<string>();
        
        // Register individual resources
        for (const resource of resources) {
            this.registerResource(resource);
            resourceIds.add(resource.id);
        }
        
        // Create resource group
        const group: ResourceGroup = {
            id: groupId,
            name: groupName,
            description: options.description || `Resource group: ${groupName}`,
            resources: resourceIds,
            cleanupOrder: options.cleanupOrder || 0,
            autoCleanup: options.autoCleanup ?? true
        };
        
        this.resourceGroups.set(groupId, group);
        this.log(`Registered resource group: ${groupName} with ${resources.length} resources`);
    }

    /**
     * Access a resource (updates access tracking)
     */
    public accessResource(resourceId: string): ManagedResource | null {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            this.log(`Resource not found: ${resourceId}`);
            return null;
        }

        resource.lastAccessed = Date.now();
        resource.accessCount++;
        
        this.logEvent('accessed', resourceId);
        return resource;
    }

    /**
     * Manually cleanup a specific resource
     */
    public async cleanupResource(resourceId: string): Promise<boolean> {
        const resource = this.resources.get(resourceId);
        if (!resource) {
            this.log(`Cannot cleanup - resource not found: ${resourceId}`);
            return false;
        }

        return this.performResourceCleanup(resource);
    }

    /**
     * Cleanup a resource group
     */
    public async cleanupResourceGroup(groupId: string): Promise<boolean> {
        const group = this.resourceGroups.get(groupId);
        if (!group) {
            this.log(`Cannot cleanup - resource group not found: ${groupId}`);
            return false;
        }

        let allSucceeded = true;
        const resourceIds = Array.from(group.resources);
        
        // Sort by cleanup priority if available
        const sortedIds = resourceIds.sort((a, b) => {
            const resourceA = this.resources.get(a);
            const resourceB = this.resources.get(b);
            if (!resourceA || !resourceB) return 0;
            
            const priorityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
            return priorityOrder[resourceA.priority] - priorityOrder[resourceB.priority];
        });

        for (const resourceId of sortedIds) {
            const success = await this.cleanupResource(resourceId);
            if (!success) {
                allSucceeded = false;
            }
        }

        if (allSucceeded) {
            this.resourceGroups.delete(groupId);
            this.log(`Successfully cleaned up resource group: ${group.name}`);
        }

        return allSucceeded;
    }

    /**
     * Cleanup resources by type
     */
    public async cleanupResourcesByType(type: ResourceType): Promise<number> {
        const resourcesOfType = Array.from(this.resources.values())
            .filter(resource => resource.type === type);

        let cleanedCount = 0;
        for (const resource of resourcesOfType) {
            const success = await this.performResourceCleanup(resource);
            if (success) {
                cleanedCount++;
            }
        }

        this.log(`Cleaned up ${cleanedCount}/${resourcesOfType.length} ${type} resources`);
        return cleanedCount;
    }

    /**
     * Cleanup resources by priority
     */
    public async cleanupResourcesByPriority(maxPriority: 'low' | 'medium' | 'high' | 'critical'): Promise<number> {
        const priorityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
        const maxPriorityValue = priorityOrder[maxPriority];

        const resourcesToCleanup = Array.from(this.resources.values())
            .filter(resource => priorityOrder[resource.priority] <= maxPriorityValue);

        let cleanedCount = 0;
        for (const resource of resourcesToCleanup) {
            const success = await this.performResourceCleanup(resource);
            if (success) {
                cleanedCount++;
            }
        }

        this.log(`Cleaned up ${cleanedCount} resources with priority <= ${maxPriority}`);
        return cleanedCount;
    }

    /**
     * Cleanup stale resources (not accessed recently)
     */
    public async cleanupStaleResources(maxAge: number = 3600000): Promise<number> { // 1 hour default
        const now = Date.now();
        const staleResources = Array.from(this.resources.values())
            .filter(resource => now - resource.lastAccessed > maxAge);

        let cleanedCount = 0;
        for (const resource of staleResources) {
            const success = await this.performResourceCleanup(resource);
            if (success) {
                cleanedCount++;
            }
        }

        this.log(`Cleaned up ${cleanedCount} stale resources (older than ${maxAge}ms)`);
        return cleanedCount;
    }

    /**
     * Perform the actual cleanup of a resource
     */
    private async performResourceCleanup(resource: ManagedResource): Promise<boolean> {
        if (this.activeCleanups.has(resource.id)) {
            this.log(`Cleanup already in progress for resource: ${resource.id}`);
            return false;
        }

        this.activeCleanups.add(resource.id);
        const startTime = performance.now();

        try {
            // Check dependencies before cleanup
            if (resource.dependencies) {
                for (const depId of resource.dependencies) {
                    if (this.resources.has(depId)) {
                        this.log(`Cannot cleanup ${resource.id} - dependency ${depId} still exists`);
                        return false;
                    }
                }
            }

            // Set cleanup timeout
            const cleanupPromise = Promise.resolve(resource.cleanup());
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error('Cleanup timeout')), this.config.maxCleanupTime);
            });

            await Promise.race([cleanupPromise, timeoutPromise]);

            // Remove from tracking
            this.resources.delete(resource.id);
            
            // Update statistics
            const cleanupTime = performance.now() - startTime;
            this.cleanupStats.totalCleanups++;
            this.cleanupStats.totalCleanupTime += cleanupTime;
            this.cleanupStats.maxCleanupTime = Math.max(this.cleanupStats.maxCleanupTime, cleanupTime);

            this.logEvent('cleaned', resource.id, { cleanupTime });
            this.log(`Successfully cleaned up ${resource.type} resource: ${resource.id} (${cleanupTime.toFixed(2)}ms)`);
            
            return true;

        } catch (error) {
            this.cleanupStats.failedCleanups++;
            this.logEvent('error', resource.id, { error: error.message });
            this.log(`Failed to cleanup resource ${resource.id}: ${error.message}`);
            
            // Mark as potential leak
            this.potentialLeaks.add(resource.id);
            
            return false;
        } finally {
            this.activeCleanups.delete(resource.id);
        }
    }

    /**
     * Start automatic cleanup process
     */
    private startAutoCleanup(): void {
        this.cleanupTimer = setInterval(() => {
            this.performAutoCleanup();
        }, this.config.cleanupInterval);

        this.registerEvent({
            on: () => {},
            off: () => {
                if (this.cleanupTimer) {
                    clearInterval(this.cleanupTimer);
                    this.cleanupTimer = undefined;
                }
            }
        } as EventRef);
    }

    /**
     * Perform automatic cleanup based on heuristics
     */
    private async performAutoCleanup(): Promise<void> {
        const stats = this.getResourceStats();
        
        // Check memory pressure
        if (stats.memoryUsage.total > this.config.memoryCriticalThreshold) {
            this.log('Critical memory pressure detected - performing aggressive cleanup');
            await this.cleanupResourcesByPriority('medium');
            await this.cleanupStaleResources(1800000); // 30 minutes
        } else if (stats.memoryUsage.total > this.config.memoryWarningThreshold) {
            this.log('Memory warning threshold exceeded - performing moderate cleanup');
            await this.cleanupResourcesByPriority('low');
            await this.cleanupStaleResources(3600000); // 1 hour
        }

        // Check resource count limits
        if (stats.totalResources > this.config.maxResources * 0.8) {
            this.log('Resource count approaching limit - cleaning up stale resources');
            await this.cleanupStaleResources(7200000); // 2 hours
        }

        // Clean up inactive resources
        const inactiveResources = Array.from(this.resources.values())
            .filter(resource => !resource.isActive());
        
        for (const resource of inactiveResources) {
            await this.performResourceCleanup(resource);
        }
    }

    /**
     * Start leak detection monitoring
     */
    private startLeakDetection(): void {
        setInterval(() => {
            this.detectLeaks();
        }, 60000); // Check every minute
    }

    /**
     * Detect potential resource leaks
     */
    private detectLeaks(): void {
        const now = Date.now();
        const leakThreshold = 300000; // 5 minutes

        for (const [resourceId, resource] of this.resources.entries()) {
            // Check for long-lived inactive resources
            if (!resource.isActive() && now - resource.lastAccessed > leakThreshold) {
                if (!this.potentialLeaks.has(resourceId)) {
                    this.potentialLeaks.add(resourceId);
                    this.logEvent('leaked', resourceId, {
                        age: now - resource.created,
                        lastAccessed: now - resource.lastAccessed
                    });
                    this.log(`Potential leak detected: ${resourceId} (${resource.type})`);
                }
            }
        }

        // Check for rapidly growing resource types
        for (const [type, count] of this.resourceCreationHistory.entries()) {
            const currentCount = Array.from(this.resources.values())
                .filter(r => r.type === type).length;
            
            if (currentCount > count * 0.8) { // 80% of created resources still exist
                this.log(`Potential leak in ${type} resources: ${currentCount}/${count} still active`);
            }
        }
    }

    /**
     * Setup global error handlers
     */
    private setupErrorHandlers(): void {
        const handleError = (error: any) => {
            this.log(`Global error occurred, checking for resource cleanup needs: ${error.message}`);
            // Could implement emergency cleanup here
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('error', handleError);
            window.addEventListener('unhandledrejection', handleError);
        }
    }

    /**
     * Check resource limits and warn if approaching
     */
    private checkResourceLimits(): void {
        const stats = this.getResourceStats();
        
        if (stats.totalResources > this.config.maxResources * 0.9) {
            this.log(`WARNING: Approaching resource limit (${stats.totalResources}/${this.config.maxResources})`);
        }
        
        if (stats.memoryUsage.total > this.config.memoryWarningThreshold) {
            this.log(`WARNING: Memory usage high (${stats.memoryUsage.total}MB)`);
        }
    }

    /**
     * Get comprehensive resource statistics
     */
    public getResourceStats(): ResourceStats {
        const resources = Array.from(this.resources.values());
        const resourcesByType: Record<ResourceType, number> = {} as any;
        const memoryByType: Record<ResourceType, number> = {} as any;
        
        let totalMemory = 0;
        
        for (const resource of resources) {
            resourcesByType[resource.type] = (resourcesByType[resource.type] || 0) + 1;
            memoryByType[resource.type] = (memoryByType[resource.type] || 0) + resource.estimatedMemoryUsage;
            totalMemory += resource.estimatedMemoryUsage;
        }

        // Calculate memory trending
        this.memoryHistory.push(totalMemory);
        if (this.memoryHistory.length > 10) {
            this.memoryHistory.shift();
        }
        
        let memoryTrending: 'increasing' | 'stable' | 'decreasing' = 'stable';
        if (this.memoryHistory.length >= 3) {
            const recent = this.memoryHistory.slice(-3);
            const trend = recent[2] - recent[0];
            if (trend > totalMemory * 0.1) memoryTrending = 'increasing';
            else if (trend < -totalMemory * 0.1) memoryTrending = 'decreasing';
        }

        // Determine health status
        let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
        if (totalMemory > this.config.memoryCriticalThreshold || 
            this.potentialLeaks.size > 10 || 
            this.activeCleanups.size > 5) {
            healthStatus = 'critical';
        } else if (totalMemory > this.config.memoryWarningThreshold || 
                   this.potentialLeaks.size > 5 || 
                   resources.length > this.config.maxResources * 0.8) {
            healthStatus = 'warning';
        }

        const avgCleanupTime = this.cleanupStats.totalCleanups > 0 ? 
            this.cleanupStats.totalCleanupTime / this.cleanupStats.totalCleanups : 0;

        return {
            totalResources: resources.length,
            resourcesByType,
            memoryUsage: {
                total: Math.round(totalMemory / (1024 * 1024)), // Convert to MB
                byType: Object.fromEntries(
                    Object.entries(memoryByType).map(([k, v]) => [k, Math.round(v / (1024 * 1024))])
                ) as Record<ResourceType, number>,
                trending: memoryTrending
            },
            performance: {
                avgCleanupTime,
                maxCleanupTime: this.cleanupStats.maxCleanupTime,
                totalCleanups: this.cleanupStats.totalCleanups,
                failedCleanups: this.cleanupStats.failedCleanups
            },
            health: {
                status: healthStatus,
                leakedResources: this.potentialLeaks.size,
                zombieResources: resources.filter(r => !r.isActive()).length,
                stalledCleanups: this.activeCleanups.size
            }
        };
    }

    /**
     * Get detailed resource information
     */
    public getResourceDetails(resourceId: string): ManagedResource | null {
        return this.resources.get(resourceId) || null;
    }

    /**
     * List all resources of a specific type
     */
    public listResourcesByType(type: ResourceType): ManagedResource[] {
        return Array.from(this.resources.values())
            .filter(resource => resource.type === type);
    }

    /**
     * Log an event for debugging
     */
    private logEvent(type: 'created' | 'accessed' | 'cleaned' | 'leaked' | 'error', resourceId: string, details?: any): void {
        if (!this.config.enableMetrics) return;

        this.eventLog.push({
            timestamp: Date.now(),
            type,
            resourceId,
            details
        });

        // Keep only recent events
        if (this.eventLog.length > 1000) {
            this.eventLog.shift();
        }
    }

    /**
     * Get event log for debugging
     */
    public getEventLog(): typeof this.eventLog {
        return [...this.eventLog];
    }

    /**
     * Force cleanup of all resources
     */
    public async cleanupAllResources(): Promise<void> {
        this.log('Starting cleanup of all resources');
        
        // Sort resource groups by cleanup order
        const sortedGroups = Array.from(this.resourceGroups.values())
            .sort((a, b) => a.cleanupOrder - b.cleanupOrder);

        // Cleanup resource groups first
        for (const group of sortedGroups) {
            await this.cleanupResourceGroup(group.id);
        }

        // Cleanup remaining individual resources
        const remainingResources = Array.from(this.resources.values())
            .sort((a, b) => {
                const priorityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });

        for (const resource of remainingResources) {
            await this.performResourceCleanup(resource);
        }

        this.log(`Cleanup complete. ${this.resources.size} resources remaining`);
    }

    /**
     * Component lifecycle: cleanup on unload
     */
    public onunload(): void {
        this.log('ResourceManager shutting down');
        
        // Stop timers
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
        }

        // Cleanup all resources
        this.cleanupAllResources().catch(error => {
            console.error('Error during ResourceManager shutdown cleanup:', error);
        });

        super.onunload();
        this.log('ResourceManager shutdown complete');
    }

    /**
     * Log debug messages
     */
    private log(message: string): void {
        if (this.config.debug) {
            console.log(`[ResourceManager] ${message}`);
        }
    }
}

/**
 * Utility functions for common resource types
 */
export class ResourceUtils {
    /**
     * Create a managed timer resource
     */
    static createTimer(
        id: string,
        callback: () => void,
        delay: number,
        description?: string
    ): Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'> {
        const timerId = setTimeout(callback, delay);
        
        return {
            id,
            type: 'timer',
            description: description || `Timer (${delay}ms)`,
            estimatedMemoryUsage: 1024, // 1KB estimate
            priority: 'low',
            tags: ['timer'],
            cleanup: () => clearTimeout(timerId),
            isActive: () => true // Timers are considered active until they fire
        };
    }

    /**
     * Create a managed interval resource
     */
    static createInterval(
        id: string,
        callback: () => void,
        interval: number,
        description?: string
    ): Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'> {
        const intervalId = setInterval(callback, interval);
        
        return {
            id,
            type: 'interval',
            description: description || `Interval (${interval}ms)`,
            estimatedMemoryUsage: 2048, // 2KB estimate
            priority: 'medium',
            tags: ['interval'],
            cleanup: () => clearInterval(intervalId),
            isActive: () => true
        };
    }

    /**
     * Create a managed worker resource
     */
    static createWorker(
        id: string,
        worker: Worker,
        description?: string
    ): Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'> {
        return {
            id,
            type: 'worker',
            description: description || 'Web Worker',
            estimatedMemoryUsage: 10 * 1024 * 1024, // 10MB estimate
            priority: 'high',
            tags: ['worker', 'async'],
            cleanup: () => worker.terminate(),
            isActive: () => true // Workers are active until terminated
        };
    }

    /**
     * Create a managed event listener resource
     */
    static createEventListener(
        id: string,
        target: EventTarget,
        event: string,
        listener: EventListener,
        description?: string
    ): Omit<ManagedResource, 'created' | 'lastAccessed' | 'accessCount'> {
        target.addEventListener(event, listener);
        
        return {
            id,
            type: 'event_listener',
            description: description || `Event listener (${event})`,
            estimatedMemoryUsage: 512, // 512B estimate
            priority: 'medium',
            tags: ['event', 'listener'],
            cleanup: () => target.removeEventListener(event, listener),
            isActive: () => true
        };
    }
}