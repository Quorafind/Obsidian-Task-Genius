import { Component } from "obsidian";
import TaskProgressBarPlugin from "../index";
import { getStatusIcon } from "../icon";
import { TaskProgressBarSettings } from "../common/setting-definition";

/**
 * Manages Task Genius Icons functionality
 * Handles CSS style injection, body class management, and cleanup
 */
export class TaskGeniusIconManager extends Component {
	private plugin: TaskProgressBarPlugin;
	private styleElement: HTMLStyleElement | null = null;
	private readonly STYLE_ID = "task-genius-icons-styles";
	private readonly BODY_CLASS = "task-genius-checkbox";

	constructor(plugin: TaskProgressBarPlugin) {
		super();
		this.plugin = plugin;
	}

	async onload() {
		// Initialize if enabled
		if (this.plugin.settings.enableTaskGeniusIcons) {
			this.enable();
		}
	}

	onunload() {
		this.disable();
	}

	/**
	 * Enable Task Genius Icons functionality
	 */
	enable() {
		try {
			this.addBodyClass();
			this.injectStyles();
		} catch (error) {
			console.error("Task Genius: Failed to enable icons:", error);
		}
	}

	/**
	 * Disable Task Genius Icons functionality
	 */
	disable() {
		try {
			this.removeBodyClass();
			this.removeStyles();
		} catch (error) {
			console.error("Task Genius: Failed to disable icons:", error);
		}
	}

	/**
	 * Update functionality when settings change
	 */
	update() {
		if (this.plugin.settings.enableTaskGeniusIcons) {
			this.enable();
		} else {
			this.disable();
		}
	}

	/**
	 * Add task-genius-checkbox class to body
	 */
	private addBodyClass() {
		document.body.classList.add(this.BODY_CLASS);
	}

	/**
	 * Remove task-genius-checkbox class from body
	 */
	private removeBodyClass() {
		document.body.classList.remove(this.BODY_CLASS);
	}

	/**
	 * Inject CSS styles into head
	 */
	private injectStyles() {
		// Remove existing styles first
		this.removeStyles();

		// Generate CSS content
		const cssContent = this.generateCSS();

		// Create and inject style element
		this.styleElement = document.createElement("style");
		this.styleElement.id = this.STYLE_ID;
		this.styleElement.textContent = cssContent;
		document.head.appendChild(this.styleElement);
	}

	/**
	 * Remove injected CSS styles
	 */
	private removeStyles() {
		if (this.styleElement) {
			this.styleElement.remove();
			this.styleElement = null;
		}

		// Also remove any existing style element with our ID
		const existingStyle = document.getElementById(this.STYLE_ID);
		if (existingStyle) {
			existingStyle.remove();
		}
	}

	/**
	 * Generate CSS content based on current settings
	 */
	private generateCSS(): string {
		const settings = this.plugin.settings;
		const statusConfigs = this.parseTaskStatuses(settings);

		let css = "";

		for (const config of statusConfigs) {
			const svgIcon = getStatusIcon(config.status);
			const fillColor = this.extractFillColor(svgIcon);
			const encodedSvg = this.encodeSvgForCSS(svgIcon);
			const requireChecked = config.status === "completed"; // Only completed should use :checked
			for (const char of config.chars) {
				css += this.generateCSSRuleForChar(
					char,
					encodedSvg,
					fillColor,
					requireChecked
				);
			}
		}

		return css;
	}

	/**
	 * Parse taskStatuses configuration into structured format
	 */
	private parseTaskStatuses(settings: TaskProgressBarSettings): Array<{
		status:
			| "notStarted"
			| "inProgress"
			| "completed"
			| "abandoned"
			| "planned";
		chars: string[];
	}> {
		const result: Array<{
			status:
				| "notStarted"
				| "inProgress"
				| "completed"
				| "abandoned"
				| "planned";
			chars: string[];
		}> = [];

		const statusMap: Record<
			string,
			"notStarted" | "inProgress" | "completed" | "abandoned" | "planned"
		> = {
			notStarted: "notStarted",
			inProgress: "inProgress",
			completed: "completed",
			abandoned: "abandoned",
			planned: "planned",
		};

		for (const [statusKey, charString] of Object.entries(
			settings.taskStatuses
		)) {
			const status = statusMap[statusKey];
			if (status) {
				const chars = charString.split("|");
				result.push({ status, chars });
			}
		}

		return result;
	}

	/**
	 * Extract fill color from SVG, prioritizing path elements
	 */
	private extractFillColor(svgString: string): string {
		try {
			// First, look for fill attribute in path elements
			const pathFillMatch = svgString.match(/<path[^>]*fill="([^"]+)"/);
			if (
				pathFillMatch &&
				pathFillMatch[1] &&
				pathFillMatch[1] !== "none" &&
				pathFillMatch[1] !== "currentColor"
			) {
				return pathFillMatch[1];
			}

			// Then, look for stroke attribute in path elements
			const pathStrokeMatch = svgString.match(
				/<path[^>]*stroke="([^"]+)"/
			);
			if (
				pathStrokeMatch &&
				pathStrokeMatch[1] &&
				pathStrokeMatch[1] !== "none" &&
				pathStrokeMatch[1] !== "currentColor"
			) {
				return pathStrokeMatch[1];
			}

			// Fallback: look for any fill attribute in the SVG
			const fillMatch = svgString.match(/fill="([^"]+)"/);
			if (
				fillMatch &&
				fillMatch[1] &&
				fillMatch[1] !== "none" &&
				fillMatch[1] !== "currentColor"
			) {
				return fillMatch[1];
			}

			// Default fallback color
			return "var(--text-accent)";
		} catch (error) {
			console.error("Task Genius: Failed to extract fill color:", error);
			return "var(--text-accent)";
		}
	}

	/**
	 * Encode SVG for use in CSS data URI
	 */
	private encodeSvgForCSS(svgString: string): string {
		try {
			// Clean up SVG but keep width and height attributes
			const cleanSvg = svgString.replace(/\s+/g, " ").trim();

			// Encode special characters for Data URI as per your specification
			const encoded = cleanSvg
				.replace(/"/g, "'") // 双引号 → 单引号
				.replace(/</g, "%3C") // < → %3C
				.replace(/>/g, "%3E") // > → %3E
				.replace(/#/g, "%23") // # → %23
				.replace(/ /g, "%20"); // 空格 → %20

			return `data:image/svg+xml,${encoded}`;
		} catch (error) {
			console.error("Task Genius: Failed to encode SVG:", error);
			return "";
		}
	}

	/**
	 * Generate CSS rule for a specific character
	 */
	private generateCSSRuleForChar(
		char: string,
		encodedSvg: string,
		fillColor: string,
		requireChecked: boolean = true
	): string {
		// Escape special characters for CSS selector
		const escapedChar = this.escapeCSSSelector(char);
		const isSpace = char === " ";

		// If we don't require :checked (e.g., planned/inProgress), always show the icon via :after
		if (!requireChecked || isSpace) {
			return `
.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox] {
    border: none;
}

.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox] {
	--checkbox-color: ${fillColor};
	--checkbox-color-hover: ${fillColor};

	background-color: unset;
	border: none;
}
.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox]:after,
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox]:after,
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox]:after {
    content: "";
    top: -1px;
    inset-inline-start: -1px;
    position: absolute;
    width: var(--checkbox-size);
    height: var(--checkbox-size);
    display: block;
	-webkit-mask-position: 52% 52%;
    -webkit-mask-repeat: no-repeat;
	-webkit-mask-image: url("${encodedSvg}");
	-webkit-mask-size: 100%;
	background-color: ${fillColor};
}
			`;
		}
		// Default: require :checked to show the icon (completed)
		return `
.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox],
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox] {
    border: none;
}

.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox]:checked,
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox]:checked,
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox]:checked {
	--checkbox-color: ${fillColor};
	--checkbox-color-hover: ${fillColor};

	background-color: unset;
	border: none;
}
.${this.BODY_CLASS} [data-task="${escapedChar}"] > input[type=checkbox]:checked:after,
.${this.BODY_CLASS} [data-task="${escapedChar}"] > p > input[type=checkbox]:checked:after,
.${this.BODY_CLASS} [data-task="${escapedChar}"][type=checkbox]:checked:after {
	-webkit-mask-image: url("${encodedSvg}");
	-webkit-mask-size: 100%;
	background-color: ${fillColor};
}
		`;
	}

	/**
	 * Escape special characters for CSS selector
	 */
	private escapeCSSSelector(char: string): string {
		// Handle space character specially
		if (char === " ") {
			return " ";
		}

		// Escape special CSS characters
		return char.replace(/[!"#$%&'()*+,.\/:;<=>?@[\\\]^`{|}~]/g, "\\$&");
	}
}
