/**
 * WebCal URL Converter
 * Converts webcal:// URLs to http:// or https:// URLs for ICS fetching
 */

export interface WebcalConversionResult {
	/** Whether the conversion was successful */
	success: boolean;
	/** The converted URL (if successful) */
	convertedUrl?: string;
	/** Original URL for reference */
	originalUrl: string;
	/** Error message (if conversion failed) */
	error?: string;
	/** Whether the original URL was a webcal URL */
	wasWebcal: boolean;
}

export class WebcalUrlConverter {
	// Regular expression to match webcal URLs
	private static readonly WEBCAL_REGEX = /^webcal:\/\//i;

	// Regular expression to validate URL format after conversion
	private static readonly URL_VALIDATION_REGEX =
		/^https?:\/\/[^\s/$.?#].[^\s]*$/i;

	/**
	 * Convert webcal URL to http/https URL
	 * @param url The URL to convert
	 * @returns Conversion result with success status and converted URL
	 */
	static convertWebcalUrl(url: string): WebcalConversionResult {
		const trimmedUrl = url.trim();

		// Check if URL is empty
		if (!trimmedUrl) {
			return {
				success: false,
				originalUrl: url,
				error: "URL cannot be empty",
				wasWebcal: false,
			};
		}

		// Check if it's a webcal URL
		const isWebcal = this.WEBCAL_REGEX.test(trimmedUrl);

		if (!isWebcal) {
			// Not a webcal URL, validate if it's a valid http/https URL
			if (this.isValidHttpUrl(trimmedUrl)) {
				return {
					success: true,
					convertedUrl: trimmedUrl,
					originalUrl: url,
					wasWebcal: false,
				};
			} else {
				return {
					success: false,
					originalUrl: url,
					error: "Invalid URL format. Please provide a valid http://, https://, or webcal:// URL",
					wasWebcal: false,
				};
			}
		}

		// Convert webcal to http/https
		try {
			const convertedUrl = this.performWebcalConversion(trimmedUrl);

			if (!this.isValidHttpUrl(convertedUrl)) {
				return {
					success: false,
					originalUrl: url,
					error: "Converted URL is not valid",
					wasWebcal: true,
				};
			}

			return {
				success: true,
				convertedUrl,
				originalUrl: url,
				wasWebcal: true,
			};
		} catch (error) {
			return {
				success: false,
				originalUrl: url,
				error:
					error instanceof Error
						? error.message
						: "Unknown conversion error",
				wasWebcal: true,
			};
		}
	}

	/**
	 * Perform the actual webcal to http/https conversion
	 * @param webcalUrl The webcal URL to convert
	 * @returns The converted http/https URL
	 */
	private static performWebcalConversion(webcalUrl: string): string {
		// Remove webcal:// prefix
		const withoutProtocol = webcalUrl.replace(this.WEBCAL_REGEX, "");

		// Determine if we should use https or http
		// Default to https for better security, unless explicitly configured otherwise
		const useHttps = this.shouldUseHttps(withoutProtocol);
		const protocol = useHttps ? "https://" : "http://";

		return protocol + withoutProtocol;
	}

	/**
	 * Determine whether to use HTTPS or HTTP for the converted URL
	 * @param urlWithoutProtocol The URL without protocol
	 * @returns True if HTTPS should be used, false for HTTP
	 */
	private static shouldUseHttps(urlWithoutProtocol: string): boolean {
		// Extract hostname
		const hostname = urlWithoutProtocol
			.split("/")[0]
			.split("?")[0]
			.toLowerCase();

		// Use HTTPS by default for security
		// Some known services that might require HTTP can be added here if needed
		const httpOnlyHosts = [
			"localhost",
			"127.0.0.1",
			// Add other known HTTP-only hosts if needed
		];

		// Check if hostname contains port number for localhost
		const hostnameWithoutPort = hostname.split(":")[0];

		return !httpOnlyHosts.includes(hostnameWithoutPort);
	}

	/**
	 * Validate if a URL is a valid HTTP/HTTPS URL
	 * @param url The URL to validate
	 * @returns True if valid, false otherwise
	 */
	private static isValidHttpUrl(url: string): boolean {
		try {
			const urlObj = new URL(url);
			return urlObj.protocol === "http:" || urlObj.protocol === "https:";
		} catch {
			return false;
		}
	}

	/**
	 * Check if a URL is a webcal URL
	 * @param url The URL to check
	 * @returns True if it's a webcal URL, false otherwise
	 */
	static isWebcalUrl(url: string): boolean {
		return this.WEBCAL_REGEX.test(url.trim());
	}

	/**
	 * Get a user-friendly description of the URL conversion
	 * @param result The conversion result
	 * @returns A description string
	 */
	static getConversionDescription(result: WebcalConversionResult): string {
		if (!result.success) {
			return `Error: ${result.error}`;
		}

		if (result.wasWebcal) {
			return `Converted webcal URL to: ${result.convertedUrl}`;
		} else {
			return `Valid HTTP/HTTPS URL: ${result.convertedUrl}`;
		}
	}

	/**
	 * Extract the final URL to use for fetching ICS data
	 * @param url The original URL input
	 * @returns The URL to use for fetching, or null if invalid
	 */
	static getFetchUrl(url: string): string | null {
		const result = this.convertWebcalUrl(url);
		return result.success ? result.convertedUrl! : null;
	}
}
