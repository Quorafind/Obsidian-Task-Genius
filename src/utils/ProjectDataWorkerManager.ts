/**
 * Project Data Worker Manager
 *
 * Manages project data computation workers to avoid blocking the main thread
 * during startup and project data operations.
 */

import { Vault, MetadataCache } from "obsidian";
import { ProjectConfigManager } from "./ProjectConfigManager";
import { ProjectDataCache, CachedProjectData } from "./ProjectDataCache";
import {
	ProjectDataResponse,
	WorkerResponse,
	UpdateConfigMessage,
	ProjectDataMessage,
	BatchProjectDataMessage,
} from "./workers/TaskIndexWorkerMessage";

// @ts-ignore Ignore type error for worker import
import ProjectWorker from "./workers/ProjectData.worker";

export interface ProjectDataWorkerManagerOptions {
	vault: Vault;
	metadataCache: MetadataCache;
	projectConfigManager: ProjectConfigManager;
	maxWorkers?: number;
	enableWorkers?: boolean; // Add option to enable/disable workers
}

export class ProjectDataWorkerManager {
	private vault: Vault;
	private metadataCache: MetadataCache;
	private projectConfigManager: ProjectConfigManager;
	private cache: ProjectDataCache;

	private workers: Worker[] = [];
	private maxWorkers: number;
	private enableWorkers: boolean;
	private requestId = 0;
	private pendingRequests = new Map<
		string,
		{
			resolve: (value: any) => void;
			reject: (error: any) => void;
		}
	>();

	// Worker round-robin index for load balancing
	private currentWorkerIndex = 0;

	constructor(options: ProjectDataWorkerManagerOptions) {
		this.vault = options.vault;
		this.metadataCache = options.metadataCache;
		this.projectConfigManager = options.projectConfigManager;
		this.maxWorkers =
			options.maxWorkers ||
			Math.max(1, Math.floor(navigator.hardwareConcurrency / 2));
		this.enableWorkers = options.enableWorkers ?? true;

		this.cache = new ProjectDataCache(
			this.vault,
			this.metadataCache,
			this.projectConfigManager
		);

		this.initializeWorkers();
	}

	/**
	 * Initialize worker pool
	 */
	private initializeWorkers(): void {
		if (!this.enableWorkers) {
			console.log(
				"ProjectDataWorkerManager: Workers disabled, using cache-only optimization"
			);
			return;
		}

		try {
			console.log(
				`ProjectDataWorkerManager: Initializing ${this.maxWorkers} workers`
			);

			for (let i = 0; i < this.maxWorkers; i++) {
				const worker = new ProjectWorker();

				worker.onmessage = (event: MessageEvent) => {
					this.handleWorkerMessage(event.data);
				};

				worker.onerror = (error: ErrorEvent) => {
					console.error(`Worker ${i} error:`, error);
				};

				this.workers.push(worker);
			}

			// Send initial configuration to all workers
			this.updateWorkerConfig();

			console.log(
				`ProjectDataWorkerManager: Successfully initialized ${this.workers.length} workers`
			);
		} catch (error) {
			console.warn(
				"ProjectDataWorkerManager: Failed to initialize workers, falling back to synchronous processing",
				error
			);
			this.enableWorkers = false;
			this.workers = [];
		}
	}

	/**
	 * Update worker configuration when settings change
	 */
	private updateWorkerConfig(): void {
		if (!this.enableWorkers || this.workers.length === 0) {
			return;
		}

		const config = this.projectConfigManager.getWorkerConfig();

		const configMessage: UpdateConfigMessage = {
			type: "updateConfig",
			requestId: this.generateRequestId(),
			config,
		};

		// Send configuration to all workers
		for (const worker of this.workers) {
			try {
				worker.postMessage(configMessage);
			} catch (error) {
				console.warn("Failed to update worker config:", error);
			}
		}

		console.log("ProjectDataWorkerManager: Updated worker configuration");
	}

	/**
	 * Get project data for a single file (uses cache first, then worker if needed)
	 */
	async getProjectData(filePath: string): Promise<CachedProjectData | null> {
		// Try cache first
		const cached = await this.cache.getProjectData(filePath);
		if (cached) {
			return cached;
		}

		// Use worker if available, otherwise fallback to synchronous computation
		if (this.enableWorkers && this.workers.length > 0) {
			return await this.computeProjectDataWithWorker(filePath);
		} else {
			return await this.computeProjectDataSync(filePath);
		}
	}

	/**
	 * Get project data for multiple files with batch optimization
	 */
	async getBatchProjectData(
		filePaths: string[]
	): Promise<Map<string, CachedProjectData>> {
		if (!this.projectConfigManager.isEnhancedProjectEnabled()) {
			return new Map();
		}

		// Use cache first for batch operation
		const cacheResult = await this.cache.getBatchProjectData(filePaths);

		// Find files that weren't in cache
		const missingPaths = filePaths.filter((path) => !cacheResult.has(path));

		if (missingPaths.length > 0) {
			// Compute missing data using workers or fallback
			let workerResults: Map<string, CachedProjectData>;

			if (this.enableWorkers && this.workers.length > 0) {
				workerResults = await this.computeBatchProjectDataWithWorkers(
					missingPaths
				);
			} else {
				workerResults = await this.computeBatchProjectDataSync(
					missingPaths
				);
			}

			// Merge results
			for (const [path, data] of workerResults) {
				cacheResult.set(path, data);
			}
		}

		return cacheResult;
	}

	/**
	 * Compute project data using worker
	 */
	private async computeProjectDataWithWorker(
		filePath: string
	): Promise<CachedProjectData | null> {
		try {
			const fileMetadata =
				await this.projectConfigManager.getFileMetadata(filePath);
			const configData =
				await this.projectConfigManager.getProjectConfigData(filePath);

			const worker = this.getNextWorker();
			const requestId = this.generateRequestId();

			const message: ProjectDataMessage = {
				type: "computeProjectData",
				requestId,
				filePath,
				fileMetadata: fileMetadata || {},
				configData: configData || {},
			};

			const response = await this.sendWorkerMessage(worker, message);

			if (response.success && response.data) {
				const projectData: CachedProjectData = {
					tgProject: response.data.tgProject,
					enhancedMetadata: response.data.enhancedMetadata,
					timestamp: response.data.timestamp,
				};

				// Cache the result
				await this.cache.setProjectData(filePath, projectData);

				return projectData;
			} else {
				throw new Error(response.error || "Worker computation failed");
			}
		} catch (error) {
			console.warn(
				`Failed to compute project data with worker for ${filePath}:`,
				error
			);
			// Fallback to synchronous computation
			return await this.computeProjectDataSync(filePath);
		}
	}

	/**
	 * Compute project data for multiple files using workers
	 */
	private async computeBatchProjectDataWithWorkers(
		filePaths: string[]
	): Promise<Map<string, CachedProjectData>> {
		const result = new Map<string, CachedProjectData>();

		if (filePaths.length === 0) {
			return result;
		}

		console.log(
			`ProjectDataWorkerManager: Computing project data for ${filePaths.length} files using ${this.workers.length} workers`
		);

		try {
			// Prepare file data for workers
			const files = await Promise.all(
				filePaths.map(async (filePath) => {
					const fileMetadata =
						await this.projectConfigManager.getFileMetadata(
							filePath
						);
					const configData =
						await this.projectConfigManager.getProjectConfigData(
							filePath
						);

					return {
						filePath,
						fileMetadata: fileMetadata || {},
						configData: configData || {},
					};
				})
			);

			// Distribute files across workers
			const filesPerWorker = Math.ceil(
				files.length / this.workers.length
			);
			const workerPromises: Promise<ProjectDataResponse[]>[] = [];

			for (let i = 0; i < this.workers.length; i++) {
				const startIndex = i * filesPerWorker;
				const endIndex = Math.min(
					startIndex + filesPerWorker,
					files.length
				);
				const workerFiles = files.slice(startIndex, endIndex);

				if (workerFiles.length > 0) {
					workerPromises.push(
						this.sendBatchRequestToWorker(i, workerFiles)
					);
				}
			}

			// Wait for all workers to complete
			const workerResults = await Promise.all(workerPromises);

			// Process results
			for (const batchResults of workerResults) {
				for (const response of batchResults) {
					if (!response.error) {
						const projectData: CachedProjectData = {
							tgProject: response.tgProject,
							enhancedMetadata: response.enhancedMetadata,
							timestamp: response.timestamp,
						};

						result.set(response.filePath, projectData);

						// Cache the result
						await this.cache.setProjectData(
							response.filePath,
							projectData
						);
					} else {
						console.warn(
							`Worker failed to process ${response.filePath}:`,
							response.error
						);
					}
				}
			}

			console.log(
				`ProjectDataWorkerManager: Successfully processed ${result.size}/${filePaths.length} files with workers`
			);
		} catch (error) {
			console.warn(
				"Failed to compute batch project data with workers:",
				error
			);
			// Fallback to synchronous computation
			return await this.computeBatchProjectDataSync(filePaths);
		}

		return result;
	}

	/**
	 * Send batch request to a specific worker
	 */
	private async sendBatchRequestToWorker(
		workerIndex: number,
		files: any[]
	): Promise<ProjectDataResponse[]> {
		const worker = this.workers[workerIndex];
		const requestId = this.generateRequestId();

		const message: BatchProjectDataMessage = {
			type: "computeBatchProjectData",
			requestId,
			files,
		};

		const response = await this.sendWorkerMessage(worker, message);

		if (response.success && response.data) {
			return response.data;
		} else {
			throw new Error(
				response.error || "Batch worker computation failed"
			);
		}
	}

	/**
	 * Send message to worker and wait for response
	 */
	private async sendWorkerMessage(
		worker: Worker,
		message: any
	): Promise<WorkerResponse> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				this.pendingRequests.delete(message.requestId);
				reject(new Error("Worker request timeout"));
			}, 30000); // 30 second timeout

			this.pendingRequests.set(message.requestId, {
				resolve: (response) => {
					clearTimeout(timeout);
					resolve(response);
				},
				reject: (error) => {
					clearTimeout(timeout);
					reject(error);
				},
			});

			try {
				worker.postMessage(message);
			} catch (error) {
				clearTimeout(timeout);
				this.pendingRequests.delete(message.requestId);
				reject(error);
			}
		});
	}

	/**
	 * Get next worker for round-robin load balancing
	 */
	private getNextWorker(): Worker {
		if (this.workers.length === 0) {
			throw new Error("No workers available");
		}

		const worker = this.workers[this.currentWorkerIndex];
		this.currentWorkerIndex =
			(this.currentWorkerIndex + 1) % this.workers.length;

		return worker;
	}

	/**
	 * Compute project data for multiple files using synchronous fallback
	 */
	private async computeBatchProjectDataSync(
		filePaths: string[]
	): Promise<Map<string, CachedProjectData>> {
		const result = new Map<string, CachedProjectData>();

		console.log(
			`ProjectDataWorkerManager: Computing project data for ${filePaths.length} files using fallback method`
		);

		// Process files in parallel using Promise.all for better performance than sequential
		const dataPromises = filePaths.map(async (filePath) => {
			try {
				const data = await this.computeProjectDataSync(filePath);
				return { filePath, data };
			} catch (error) {
				console.warn(
					`Failed to compute project data for ${filePath}:`,
					error
				);
				return { filePath, data: null };
			}
		});

		const results = await Promise.all(dataPromises);

		for (const { filePath, data } of results) {
			if (data) {
				result.set(filePath, data);
			}
		}

		return result;
	}

	/**
	 * Compute project data synchronously (fallback)
	 */
	private async computeProjectDataSync(
		filePath: string
	): Promise<CachedProjectData | null> {
		try {
			const tgProject =
				await this.projectConfigManager.determineTgProject(filePath);
			const enhancedMetadata =
				await this.projectConfigManager.getEnhancedMetadata(filePath);

			const data: CachedProjectData = {
				tgProject,
				enhancedMetadata,
				timestamp: Date.now(),
			};

			// Cache the result
			await this.cache.setProjectData(filePath, data);

			return data;
		} catch (error) {
			console.warn(
				`Failed to compute project data for ${filePath}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Handle worker messages
	 */
	private handleWorkerMessage(message: WorkerResponse): void {
		const pendingRequest = this.pendingRequests.get(message.requestId);
		if (!pendingRequest) {
			return;
		}

		this.pendingRequests.delete(message.requestId);

		if (message.success) {
			pendingRequest.resolve(message);
		} else {
			pendingRequest.reject(
				new Error(message.error || "Unknown worker error")
			);
		}
	}

	/**
	 * Generate unique request ID
	 */
	private generateRequestId(): string {
		return `req_${++this.requestId}_${Date.now()}`;
	}

	/**
	 * Clear cache
	 */
	clearCache(filePath?: string): void {
		this.cache.clearCache(filePath);
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats() {
		return this.cache.getStats();
	}

	/**
	 * Handle setting changes
	 */
	onSettingsChange(): void {
		this.updateWorkerConfig();
		this.cache.clearCache(); // Clear cache when settings change
	}

	/**
	 * Handle enhanced project setting change
	 */
	onEnhancedProjectSettingChange(enabled: boolean): void {
		this.cache.onEnhancedProjectSettingChange(enabled);

		// Reinitialize workers if needed
		if (enabled && this.enableWorkers && this.workers.length === 0) {
			this.initializeWorkers();
		}
	}

	/**
	 * Enable or disable workers
	 */
	setWorkersEnabled(enabled: boolean): void {
		if (this.enableWorkers === enabled) {
			return;
		}

		this.enableWorkers = enabled;

		if (enabled) {
			this.initializeWorkers();
		} else {
			this.destroy();
		}
	}

	/**
	 * Check if workers are enabled and available
	 */
	isWorkersEnabled(): boolean {
		return this.enableWorkers && this.workers.length > 0;
	}

	/**
	 * Preload project data for files (optimization for startup)
	 */
	async preloadProjectData(filePaths: string[]): Promise<void> {
		if (filePaths.length === 0) {
			return;
		}

		// Use batch processing for efficiency
		await this.getBatchProjectData(filePaths);
	}

	/**
	 * Handle file modification for incremental updates
	 */
	async onFileModified(filePath: string): Promise<void> {
		await this.cache.onFileModified(filePath);
	}

	/**
	 * Handle file deletion
	 */
	onFileDeleted(filePath: string): void {
		this.cache.onFileDeleted(filePath);
	}

	/**
	 * Handle file creation
	 */
	async onFileCreated(filePath: string): Promise<void> {
		await this.cache.onFileCreated(filePath);
	}

	/**
	 * Handle file rename/move
	 */
	async onFileRenamed(oldPath: string, newPath: string): Promise<void> {
		await this.cache.onFileRenamed(oldPath, newPath);
	}

	/**
	 * Refresh stale cache entries periodically
	 */
	async refreshStaleEntries(): Promise<void> {
		await this.cache.refreshStaleEntries();
	}

	/**
	 * Preload data for recently accessed files
	 */
	async preloadRecentFiles(filePaths: string[]): Promise<void> {
		await this.cache.preloadRecentFiles(filePaths);
	}

	/**
	 * Get memory usage statistics
	 */
	getMemoryStats(): {
		fileCacheSize: number;
		directoryCacheSize: number;
		pendingRequests: number;
		activeWorkers: number;
		workersEnabled: boolean;
	} {
		return {
			fileCacheSize: (this.cache as any).fileCache?.size || 0,
			directoryCacheSize: (this.cache as any).directoryCache?.size || 0,
			pendingRequests: this.pendingRequests.size,
			activeWorkers: this.workers.length,
			workersEnabled: this.enableWorkers,
		};
	}

	/**
	 * Cleanup resources
	 */
	destroy(): void {
		// Terminate all workers
		for (const worker of this.workers) {
			try {
				worker.terminate();
			} catch (error) {
				console.warn("Error terminating worker:", error);
			}
		}
		this.workers = [];

		// Clear pending requests
		for (const { reject } of this.pendingRequests.values()) {
			reject(new Error("Worker manager destroyed"));
		}
		this.pendingRequests.clear();
	}
}
