/**
 * Simple rebuild progress tracker using Obsidian's Notice component
 */

import { Notice } from "obsidian";

/**
 * Manages rebuild progress notifications using a single persistent Notice
 */
export class RebuildProgressManager {
	private notice: Notice | null = null;
	private startTime: number = 0;
	private processedFiles: number = 0;
	private totalFiles: number = 0;
	private tasksFound: number = 0;

	/**
	 * Start tracking rebuild progress
	 */
	public startRebuild(totalFiles: number, reason?: string): void {
		this.startTime = Date.now();
		this.processedFiles = 0;
		this.totalFiles = totalFiles;
		this.tasksFound = 0;

		// Create persistent notice (duration: 0 means it won't auto-hide)
		const reasonText = reason ? ` (${reason})` : "";
		this.notice = new Notice(
			`Task Genius: Starting rebuild${reasonText}...`,
			0
		);
	}

	/**
	 * Update progress with current step information
	 */
	public updateStep(step: string, currentFile?: string): void {
		if (!this.notice) return;

		let message = `Task Genius: ${step}`;

		if (this.totalFiles > 0) {
			const percentage = Math.round(
				(this.processedFiles / this.totalFiles) * 100
			);
			message += ` (${this.processedFiles}/${this.totalFiles} - ${percentage}%)`;
		}

		if (this.tasksFound > 0) {
			message += ` - ${this.tasksFound} tasks found`;
		}

		if (currentFile) {
			const fileName = currentFile.split("/").pop() || currentFile;
			message += ` - ${fileName}`;
		}

		this.notice.setMessage(message);
	}

	/**
	 * Increment processed files count and update progress
	 */
	public incrementProcessedFiles(tasksFound: number = 0): void {
		this.processedFiles++;
		this.tasksFound += tasksFound;

		if (!this.notice) return;

		const percentage =
			this.totalFiles > 0
				? Math.round((this.processedFiles / this.totalFiles) * 100)
				: 0;

		const message = `Task Genius: Processing files (${this.processedFiles}/${this.totalFiles} - ${percentage}%) - ${this.tasksFound} tasks found`;
		this.notice.setMessage(message);
	}

	/**
	 * Mark rebuild as complete and show final statistics
	 */
	public completeRebuild(finalTaskCount?: number): void {
		if (!this.notice) return;

		const duration = Date.now() - this.startTime;
		const durationText =
			duration > 1000
				? `${Math.round(duration / 1000)}s`
				: `${duration}ms`;

		const taskCount = finalTaskCount ?? this.tasksFound;
		const message = `Task Genius: Rebuild complete! Found ${taskCount} tasks in ${durationText}`;

		this.notice.setMessage(message);

		// Auto-hide the completion notice after 3 seconds
		setTimeout(() => {
			if (this.notice) {
				this.notice.hide();
				this.notice = null;
			}
		}, 3000);
	}

	/**
	 * Mark rebuild as failed and show error
	 */
	public failRebuild(error: string): void {
		if (!this.notice) return;

		const message = `Task Genius: Rebuild failed - ${error}`;
		this.notice.setMessage(message);

		// Auto-hide the error notice after 5 seconds
		setTimeout(() => {
			if (this.notice) {
				this.notice.hide();
				this.notice = null;
			}
		}, 5000);
	}

	/**
	 * Clean up and hide any active notice
	 */
	public cleanup(): void {
		if (this.notice) {
			this.notice.hide();
			this.notice = null;
		}
	}
}
