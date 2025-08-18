/**
 * Project Data Worker
 * 
 * Handles project data computation in background thread to avoid blocking main thread.
 * This worker processes project mappings, path patterns, and metadata transformations.
 */

import { WorkerMessage, ProjectDataMessage, ProjectDataResponse, WorkerResponse } from './TaskIndexWorkerMessage';

// Interfaces for project data processing
interface ProjectMapping {
	pathPattern: string;
	projectName: string;
	enabled: boolean;
}

interface MetadataMapping {
	sourceKey: string;
	targetKey: string;
	enabled: boolean;
}

interface ProjectNamingStrategy {
	strategy: "filename" | "foldername" | "metadata";
	metadataKey?: string;
	stripExtension?: boolean;
	enabled: boolean;
}

interface ProjectWorkerConfig {
	pathMappings: ProjectMapping[];
	metadataMappings: MetadataMapping[];
	defaultProjectNaming: ProjectNamingStrategy;
	metadataKey: string;
}

interface FileProjectData {
	filePath: string;
	fileMetadata: Record<string, any>;
	configData: Record<string, any>;
	directoryConfigPath?: string;
}

// Global configuration for the worker
let workerConfig: ProjectWorkerConfig | null = null;

/**
 * Compute project data for a single file
 */
function computeProjectData(message: ProjectDataMessage): ProjectDataResponse {
	if (!workerConfig) {
		throw new Error('Worker not configured');
	}

	const { filePath, fileMetadata, configData } = message;

	// Determine tgProject using the same logic as ProjectConfigManager
	const tgProject = determineTgProject(filePath, fileMetadata, configData);

	// Apply metadata mappings
	const enhancedMetadata = applyMetadataMappings({
		...configData,
		...fileMetadata
	});

	return {
		filePath,
		tgProject,
		enhancedMetadata,
		timestamp: Date.now()
	};
}

/**
 * Compute project data for multiple files
 */
function computeBatchProjectData(files: FileProjectData[]): ProjectDataResponse[] {
	if (!workerConfig) {
		throw new Error('Worker not configured');
	}

	const results: ProjectDataResponse[] = [];

	for (const file of files) {
		try {
			const result = computeProjectData({
				type: 'computeProjectData',
				requestId: '', // Not used in batch processing
				filePath: file.filePath,
				fileMetadata: file.fileMetadata,
				configData: file.configData
			});
			results.push(result);
		} catch (error) {
			console.warn(`Failed to process project data for ${file.filePath}:`, error);
			// Add error result to maintain array order
			results.push({
				filePath: file.filePath,
				tgProject: undefined,
				enhancedMetadata: {},
				timestamp: Date.now(),
				error: error instanceof Error ? error.message : String(error)
			});
		}
	}

	return results;
}

/**
 * Determine tgProject for a file
 */
function determineTgProject(
	filePath: string,
	fileMetadata: Record<string, any>,
	configData: Record<string, any>
): any {
	if (!workerConfig) {
		return undefined;
	}

	// 1. Check path-based mappings first (highest priority)
	for (const mapping of workerConfig.pathMappings) {
		if (!mapping.enabled) continue;

		if (matchesPathPattern(filePath, mapping.pathPattern)) {
			return {
				type: "path",
				name: mapping.projectName,
				source: mapping.pathPattern,
				readonly: true,
			};
		}
	}

	// 2. Check file metadata (frontmatter)
	if (fileMetadata && fileMetadata[workerConfig.metadataKey]) {
		const projectFromMetadata = fileMetadata[workerConfig.metadataKey];
		if (typeof projectFromMetadata === "string" && projectFromMetadata.trim()) {
			return {
				type: "metadata",
				name: projectFromMetadata.trim(),
				source: workerConfig.metadataKey,
				readonly: true,
			};
		}
	}

	// 3. Check project config file (lower priority)  
	if (configData && configData.project) {
		const projectFromConfig = configData.project;
		if (typeof projectFromConfig === "string" && projectFromConfig.trim()) {
			return {
				type: "config",
				name: projectFromConfig.trim(),
				source: "project-config",
				readonly: true,
			};
		}
	}

	// 4. Apply default project naming strategy (lowest priority)
	if (workerConfig.defaultProjectNaming.enabled) {
		const defaultProject = generateDefaultProjectName(filePath, fileMetadata);
		if (defaultProject) {
			return {
				type: "default",
				name: defaultProject,
				source: workerConfig.defaultProjectNaming.strategy,
				readonly: true,
			};
		}
	}

	return undefined;
}

/**
 * Check if a file path matches a path pattern
 */
function matchesPathPattern(filePath: string, pattern: string): boolean {
	const normalizedPath = filePath.replace(/\\/g, "/");
	const normalizedPattern = pattern.replace(/\\/g, "/");

	// Support wildcards
	if (pattern.includes("*")) {
		const regexPattern = pattern
			.replace(/\*/g, ".*")
			.replace(/\?/g, ".");
		const regex = new RegExp(`^${regexPattern}$`, "i");
		return regex.test(normalizedPath);
	}

	// Simple substring match
	return normalizedPath.includes(normalizedPattern);
}

/**
 * Generate default project name based on strategy
 */
function generateDefaultProjectName(filePath: string, fileMetadata: Record<string, any>): string | null {
	if (!workerConfig || !workerConfig.defaultProjectNaming.enabled) {
		return null;
	}

	switch (workerConfig.defaultProjectNaming.strategy) {
		case "filename": {
			const fileName = filePath.split("/").pop() || "";
			if (workerConfig.defaultProjectNaming.stripExtension) {
				return fileName.replace(/\.[^/.]+$/, "");
			}
			return fileName;
		}
		case "foldername": {
			const pathParts = filePath.split("/");
			if (pathParts.length > 1) {
				return pathParts[pathParts.length - 2] || "";
			}
			return "";
		}
		case "metadata": {
			const metadataKey = workerConfig.defaultProjectNaming.metadataKey;
			if (!metadataKey) {
				return null;
			}
			if (fileMetadata && fileMetadata[metadataKey]) {
				const value = fileMetadata[metadataKey];
				return typeof value === "string" ? value.trim() : String(value);
			}
			return null;
		}
		default:
			return null;
	}
}

/**
 * Apply metadata mappings to transform source metadata keys to target keys
 */
function applyMetadataMappings(metadata: Record<string, any>): Record<string, any> {
	if (!workerConfig) {
		return metadata;
	}

	const result = { ...metadata };

	for (const mapping of workerConfig.metadataMappings) {
		if (!mapping.enabled) continue;

		const sourceValue = metadata[mapping.sourceKey];
		if (sourceValue !== undefined) {
			result[mapping.targetKey] = convertMetadataValue(
				mapping.targetKey,
				sourceValue
			);
		}
	}

	return result;
}

/**
 * Convert metadata value based on target key type
 */
function convertMetadataValue(targetKey: string, value: any): any {
	// Date field detection patterns
	const dateFieldPatterns = [
		"due", "dueDate", "deadline", "start", "startDate", "started",
		"scheduled", "scheduledDate", "scheduled_for", "completed",
		"completedDate", "finished", "created", "createdDate", "created_at"
	];

	// Priority field detection patterns
	const priorityFieldPatterns = ["priority", "urgency", "importance"];

	// Check if it's a date field
	const isDateField = dateFieldPatterns.some((pattern) =>
		targetKey.toLowerCase().includes(pattern.toLowerCase())
	);

	// Check if it's a priority field
	const isPriorityField = priorityFieldPatterns.some((pattern) =>
		targetKey.toLowerCase().includes(pattern.toLowerCase())
	);

	if (isDateField && typeof value === "string") {
		// Try to convert date string to timestamp
		if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
			try {
				const date = new Date(value);
				return date.getTime();
			} catch {
				return value;
			}
		}
	} else if (isPriorityField && typeof value === "string") {
		// Convert priority string to number
		const priorityMap: Record<string, number> = {
			highest: 5, urgent: 5, critical: 5,
			high: 4, important: 4,
			medium: 3, normal: 3, moderate: 3,
			low: 2, minor: 2,
			lowest: 1, trivial: 1,
		};

		const numericPriority = parseInt(value, 10);
		if (!isNaN(numericPriority)) {
			return numericPriority;
		}

		const mappedPriority = priorityMap[value.toLowerCase()];
		if (mappedPriority !== undefined) {
			return mappedPriority;
		}
	}

	return value;
}

/**
 * Worker message handler - following the same pattern as TaskIndex.worker.ts
 */
self.onmessage = async (event) => {
	try {
		const message = event.data as WorkerMessage;

		switch (message.type) {
			case 'updateConfig':
				const configMsg = message as any;
				workerConfig = configMsg.config;
				self.postMessage({
					type: 'configUpdated',
					requestId: message.requestId,
					success: true
				});
				break;

			case 'computeProjectData':
				const result = computeProjectData(message as ProjectDataMessage);
				self.postMessage({
					type: 'projectDataResult',
					requestId: message.requestId,
					success: true,
					data: result
				});
				break;

			case 'computeBatchProjectData':
				const batchMsg = message as any;
				const batchResult = computeBatchProjectData(batchMsg.files);
				self.postMessage({
					type: 'batchProjectDataResult',
					requestId: message.requestId,
					success: true,
					data: batchResult
				});
				break;

			default:
				throw new Error(`Unknown message type: ${(message as any).type}`);
		}
	} catch (error) {
		self.postMessage({
			type: 'error',
			requestId: (event.data as WorkerMessage).requestId,
			success: false,
			error: error instanceof Error ? error.message : String(error)
		});
	}
};