/**
 * File Metadata Task Parser
 * Extracts tasks from file metadata and tags
 */

import { TFile, CachedMetadata } from "obsidian";
import { StandardFileTaskMetadata, Task } from "../../types/task";
import { FileParsingConfiguration, ProjectDetectionMethod } from "../../common/setting-definition";

export interface FileTaskParsingResult {
	tasks: Task[];
	errors: string[];
}

export class FileMetadataTaskParser {
	private config: FileParsingConfiguration;
	private projectDetectionMethods?: ProjectDetectionMethod[];

	constructor(config: FileParsingConfiguration, projectDetectionMethods?: ProjectDetectionMethod[]) {
		this.config = config;
		this.projectDetectionMethods = projectDetectionMethods;
	}

	/**
	 * Parse tasks from a file's metadata and tags
	 */
	parseFileForTasks(
		filePath: string,
		fileContent: string,
		fileCache?: CachedMetadata
	): FileTaskParsingResult {
		const tasks: Task[] = [];
		const errors: string[] = [];

		try {
			// Parse tasks from frontmatter metadata
			if (
				this.config.enableFileMetadataParsing &&
				fileCache?.frontmatter
			) {
				const metadataTasks = this.parseMetadataTasks(
					filePath,
					fileCache.frontmatter,
					fileContent,
					fileCache
				);
				tasks.push(...metadataTasks.tasks);
				errors.push(...metadataTasks.errors);
			}

			// Parse tasks from file tags
			if (this.config.enableTagBasedTaskParsing && fileCache?.tags) {
				const tagTasks = this.parseTagTasks(
					filePath,
					fileCache.tags,
					fileCache.frontmatter,
					fileContent,
					fileCache
				);
				tasks.push(...tagTasks.tasks);
				errors.push(...tagTasks.errors);
			}
		} catch (error) {
			errors.push(`Error parsing file ${filePath}: ${error.message}`);
		}

		return { tasks, errors };
	}

	/**
	 * Parse tasks from file frontmatter metadata
	 */
	private parseMetadataTasks(
		filePath: string,
		frontmatter: Record<string, any>,
		fileContent: string,
		fileCache?: CachedMetadata
	): FileTaskParsingResult {
		const tasks: Task[] = [];
		const errors: string[] = [];

		for (const fieldName of this.config.metadataFieldsToParseAsTasks) {
			if (frontmatter[fieldName] !== undefined) {
				try {
					const task = this.createTaskFromMetadata(
						filePath,
						fieldName,
						frontmatter[fieldName],
						frontmatter,
						fileContent,
						fileCache
					);
					if (task) {
						tasks.push(task);
					}
				} catch (error) {
					errors.push(
						`Error creating task from metadata field ${fieldName} in ${filePath}: ${error.message}`
					);
				}
			}
		}

		return { tasks, errors };
	}

	/**
	 * Parse tasks from file tags
	 */
	private parseTagTasks(
		filePath: string,
		tags: Array<{ tag: string; position: any }>,
		frontmatter: Record<string, any> | undefined,
		fileContent: string,
		fileCache?: CachedMetadata
	): FileTaskParsingResult {
		const tasks: Task[] = [];
		const errors: string[] = [];

		const fileTags = tags.map((t) => t.tag);

		for (const targetTag of this.config.tagsToParseAsTasks) {
			// Normalize tag format (ensure it starts with #)
			const normalizedTargetTag = targetTag.startsWith("#")
				? targetTag
				: `#${targetTag}`;

			if (fileTags.some((tag) => tag === normalizedTargetTag)) {
				try {
					const task = this.createTaskFromTag(
						filePath,
						normalizedTargetTag,
						frontmatter,
						fileContent,
						fileCache
					);
					if (task) {
						tasks.push(task);
					}
				} catch (error) {
					errors.push(
						`Error creating task from tag ${normalizedTargetTag} in ${filePath}: ${error.message}`
					);
				}
			}
		}

		return { tasks, errors };
	}

	/**
	 * Create a task from metadata field
	 */
	private createTaskFromMetadata(
		filePath: string,
		fieldName: string,
		fieldValue: any,
		frontmatter: Record<string, any>,
		fileContent: string,
		fileCache?: CachedMetadata
	): Task | null {
		// Get task content from specified metadata field or filename
		const taskContent = this.getTaskContent(frontmatter, filePath);

		// Create unique task ID
		const taskId = `${filePath}-metadata-${fieldName}`;

		// Determine task status based on field value and name
		const status = this.determineTaskStatus(fieldName, fieldValue);
		const completed = status.toLowerCase() === "x";

		// Extract additional metadata
		const metadata = this.extractTaskMetadata(
			filePath,
			frontmatter,
			fieldName,
			fieldValue,
			fileCache
		);

		console.log("metadata", metadata);

		const task: Task = {
			id: taskId,
			content: taskContent,
			filePath,
			line: 0, // Metadata tasks don't have a specific line
			completed,
			status,
			originalMarkdown: `- [${status}] ${taskContent}`,
			metadata: {
				...metadata,
				tags: this.extractTags(frontmatter),
				children: [],
				heading: [],
				// Add source information
				source: "file-metadata",
				sourceField: fieldName,
				sourceValue: fieldValue,
			} as StandardFileTaskMetadata,
		};

		return task;
	}

	/**
	 * Create a task from file tag
	 */
	private createTaskFromTag(
		filePath: string,
		tag: string,
		frontmatter: Record<string, any> | undefined,
		fileContent: string,
		fileCache?: CachedMetadata
	): Task | null {
		// Get task content from specified metadata field or filename
		const taskContent = this.getTaskContent(frontmatter, filePath);

		// Create unique task ID
		const taskId = `${filePath}-tag-${tag.replace("#", "")}`;

		// Use default task status
		const status = this.config.defaultTaskStatus;
		const completed = status.toLowerCase() === "x";

		// Extract additional metadata
		const metadata = this.extractTaskMetadata(
			filePath,
			frontmatter || {},
			"tag",
			tag,
			fileCache
		);

		const task: Task = {
			id: taskId,
			content: taskContent,
			filePath,
			line: 0, // Tag tasks don't have a specific line
			completed,
			status,
			originalMarkdown: `- [${status}] ${taskContent}`,
			metadata: {
				...metadata,
				tags: this.extractTags(frontmatter),
				children: [],
				heading: [],
				// Add source information
				source: "file-tag",
				sourceTag: tag,
			} as StandardFileTaskMetadata,
		};

		return task;
	}

	/**
	 * Get task content from metadata or filename
	 */
	private getTaskContent(
		frontmatter: Record<string, any> | undefined,
		filePath: string
	): string {
		if (frontmatter && frontmatter[this.config.taskContentFromMetadata]) {
			return String(frontmatter[this.config.taskContentFromMetadata]);
		}

		// Fallback to filename without extension
		const fileName = filePath.split("/").pop() || filePath;
		return fileName.replace(/\.[^/.]+$/, "");
	}

	/**
	 * Determine task status based on field name and value
	 */
	private determineTaskStatus(fieldName: string, fieldValue: any): string {
		// If field name suggests completion
		if (
			fieldName.toLowerCase().includes("complete") ||
			fieldName.toLowerCase().includes("done")
		) {
			return fieldValue ? "x" : " ";
		}

		// If field name suggests todo/task
		if (
			fieldName.toLowerCase().includes("todo") ||
			fieldName.toLowerCase().includes("task")
		) {
			// If it's a boolean, use it to determine status
			if (typeof fieldValue === "boolean") {
				return fieldValue ? "x" : " ";
			}
			// If it's a string that looks like a status
			if (typeof fieldValue === "string" && fieldValue.length === 1) {
				return fieldValue;
			}
		}

		// If field name suggests due date
		if (fieldName.toLowerCase().includes("due")) {
			return " "; // Due dates are typically incomplete tasks
		}

		// Default to configured default status
		return this.config.defaultTaskStatus;
	}

	/**
	 * Extract task metadata from frontmatter
	 */
	private extractTaskMetadata(
		filePath: string,
		frontmatter: Record<string, any>,
		sourceField: string,
		sourceValue: any,
		fileCache?: CachedMetadata
	): Record<string, any> {
		const metadata: Record<string, any> = {};

		// Extract common task metadata fields
		if (frontmatter.dueDate) {
			metadata.dueDate = this.parseDate(frontmatter.dueDate);
		}
		if (frontmatter.startDate) {
			metadata.startDate = this.parseDate(frontmatter.startDate);
		}
		if (frontmatter.scheduledDate) {
			metadata.scheduledDate = this.parseDate(frontmatter.scheduledDate);
		}
		if (frontmatter.priority) {
			metadata.priority = this.parsePriority(frontmatter.priority);
		}
		// Try custom project detection methods first
		// Note: Pass fileCache to detect from tags and links
		const detectedProject = this.detectProjectFromFile(filePath, frontmatter, fileCache);
		if (detectedProject) {
			metadata.project = detectedProject;
		} else if (frontmatter.project) {
			// Fallback to legacy project field
			metadata.project = String(frontmatter.project);
		}
		if (frontmatter.context) {
			metadata.context = String(frontmatter.context);
		}
		if (frontmatter.area) {
			metadata.area = String(frontmatter.area);
		}

		// If the source field is a date field, use it appropriately
		if (sourceField.toLowerCase().includes("due") && sourceValue) {
			metadata.dueDate = this.parseDate(sourceValue);
		}

		return metadata;
	}

	/**
	 * Detect project from file using custom detection methods
	 */
	private detectProjectFromFile(
		filePath: string,
		frontmatter: Record<string, any>,
		fileCache?: CachedMetadata
	): string | undefined {
		if (!this.projectDetectionMethods || this.projectDetectionMethods.length === 0) {
			return undefined;
		}

		for (const method of this.projectDetectionMethods) {
			if (!method.enabled) continue;

			switch (method.type) {
				case "metadata":
					// Check if the specified metadata property exists in frontmatter
					if (frontmatter[method.propertyKey]) {
						return String(frontmatter[method.propertyKey]);
					}
					break;

				case "tag":
					// Check if file has the specified tag in content (using CachedMetadata.tags)
					if (fileCache?.tags) {
						const targetTag = method.propertyKey.startsWith("#") 
							? method.propertyKey 
							: `#${method.propertyKey}`;
						
						// Check if any tag in the file matches our target
						const hasTag = fileCache.tags.some(tagCache => 
							tagCache.tag === targetTag
						);
						
						if (hasTag) {
							// First try to use title or name from frontmatter as project name
							if (frontmatter.title) {
								return String(frontmatter.title);
							}
							if (frontmatter.name) {
								return String(frontmatter.name);
							}
							// Fallback: use the file name (without extension)
							const fileName = filePath.split('/').pop() || filePath;
							return fileName.replace(/\.md$/i, '');
						}
					}
					break;

				case "link":
					// Check all links in the file (using CachedMetadata.links)
					if (fileCache?.links) {
						// Look for links that match our filter
						for (const linkCache of fileCache.links) {
							const linkedNote = linkCache.link;
							
							// If there's a filter, check if the link matches
							if (method.linkFilter) {
								if (linkedNote.includes(method.linkFilter)) {
									// First try to use title or name from frontmatter as project name
									if (frontmatter.title) {
										return String(frontmatter.title);
									}
									if (frontmatter.name) {
										return String(frontmatter.name);
									}
									// Fallback: use the file name (without extension)
									const fileName = filePath.split('/').pop() || filePath;
									return fileName.replace(/\.md$/i, '');
								}
							} else if (method.propertyKey) {
								// If a property key is specified, only check links in that metadata field
								if (frontmatter[method.propertyKey]) {
									const propValue = String(frontmatter[method.propertyKey]);
									// Check if this link is mentioned in the property
									if (propValue.includes(`[[${linkedNote}]]`)) {
										// First try to use title or name from frontmatter as project name
										if (frontmatter.title) {
											return String(frontmatter.title);
										}
										if (frontmatter.name) {
											return String(frontmatter.name);
										}
										// Fallback: use the file name (without extension)
										const fileName = filePath.split('/').pop() || filePath;
										return fileName.replace(/\.md$/i, '');
									}
								}
							} else {
								// No filter and no specific property, use first link as project
								// First try to use title or name from frontmatter as project name
								if (frontmatter.title) {
									return String(frontmatter.title);
								}
								if (frontmatter.name) {
									return String(frontmatter.name);
								}
								// Fallback: use the file name (without extension)
								const fileName = filePath.split('/').pop() || filePath;
								return fileName.replace(/\.md$/i, '');
							}
						}
					}
					break;
			}
		}

		return undefined;
	}

	/**
	 * Extract tags from frontmatter
	 */
	private extractTags(
		frontmatter: Record<string, any> | undefined
	): string[] {
		if (!frontmatter) return [];

		const tags: string[] = [];

		// Extract from tags field
		if (frontmatter.tags) {
			if (Array.isArray(frontmatter.tags)) {
				tags.push(...frontmatter.tags.map((tag) => String(tag)));
			} else {
				tags.push(String(frontmatter.tags));
			}
		}

		// Extract from tag field (singular)
		if (frontmatter.tag) {
			if (Array.isArray(frontmatter.tag)) {
				tags.push(...frontmatter.tag.map((tag) => String(tag)));
			} else {
				tags.push(String(frontmatter.tag));
			}
		}

		return tags;
	}

	/**
	 * Parse date from various formats
	 */
	private parseDate(dateValue: any): number | undefined {
		if (!dateValue) return undefined;

		if (typeof dateValue === "number") {
			return dateValue;
		}

		if (typeof dateValue === "string") {
			const parsed = Date.parse(dateValue);
			return isNaN(parsed) ? undefined : parsed;
		}

		if (dateValue instanceof Date) {
			return dateValue.getTime();
		}

		return undefined;
	}

	/**
	 * Parse priority from various formats
	 */
	private parsePriority(priorityValue: any): number | undefined {
		if (typeof priorityValue === "number") {
			return Math.max(1, Math.min(3, Math.round(priorityValue)));
		}

		if (typeof priorityValue === "string") {
			const num = parseInt(priorityValue, 10);
			if (!isNaN(num)) {
				return Math.max(1, Math.min(3, num));
			}

			// Handle text priorities
			const lower = priorityValue.toLowerCase();
			if (lower.includes("high") || lower.includes("urgent")) return 3;
			if (lower.includes("medium") || lower.includes("normal")) return 2;
			if (lower.includes("low")) return 1;
		}

		return undefined;
	}
}
